/* ==========================================================================
   APP.JS — Lista de regalos de casamiento con transferencias
   ========================================================================== */
(function () {
  "use strict";

  const CONFIG = {
    SUPABASE_URL: "https://qdcezlxwnnfjwhceoybe.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkY2V6bHh3bm5mandoY2VveWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTkxNzEsImV4cCI6MjA5OTEzNTE3MX0.ubCmhihpJ5uUNDKFVoljcLtYuAGZ0IaMq8Jxm6qYx_U",
    CURRENCY: "ARS",
  };

  const supabaseClient = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY
  );

  let giftsState = [];
  let donationsState = [];
  let selectedGiftId = null;
  let selectedAmount = null;

  const currencyFormatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: CONFIG.CURRENCY,
    maximumFractionDigits: 0,
  });

  function formatMoney(amount) {
    return currencyFormatter.format(Number(amount || 0));
  }

  function calcPercent(gift) {
    if (!gift.targetAmount) return 0;
    return Math.min(100, Math.round((Number(gift.raisedAmount || 0) / Number(gift.targetAmount)) * 100));
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function normalizeGift(gift, raisedAmount = 0) {
    return {
      id: gift.id,
      name: gift.name,
      description: gift.description,
      icon: gift.icon,
      targetAmount: Number(gift.target_amount || 0),
      raisedAmount: Number(raisedAmount || 0),
      suggestedAmounts: gift.suggested_amounts || [],
    };
  }

  function normalizeDonation(donation) {
    return {
      id: donation.id,
      giftId: donation.gift_id,
      amount: Number(donation.amount || 0),
      guestName: donation.guest_name,
      message: donation.message,
      createdAt: donation.created_at,
    };
  }

  async function getDonations() {
    const { data, error } = await supabaseClient
      .from("donations")
      .select("id, gift_id, amount, guest_name, message, created_at, status")
      .eq("status", "confirmed")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(normalizeDonation);
  }

  async function getGifts() {
    const [{ data: gifts, error: giftsError }, donations] = await Promise.all([
      supabaseClient.from("gifts").select("id, name, description, icon, target_amount, suggested_amounts, created_at").order("created_at", { ascending: true }),
      getDonations(),
    ]);

    if (giftsError) throw giftsError;

    const totalsByGift = donations.reduce((acc, donation) => {
      acc[donation.giftId] = (acc[donation.giftId] || 0) + donation.amount;
      return acc;
    }, {});

    donationsState = donations;
    return (gifts || []).map((gift) => normalizeGift(gift, totalsByGift[gift.id] || 0));
  }

  async function createDonation({ giftId, amount, guestName, message }) {
    if (!giftId) throw new Error("Falta el regalo seleccionado.");
    if (!amount || amount < 500) throw new Error("El monto mínimo es $500.");

    const { error } = await supabaseClient.from("donations").insert({
      gift_id: giftId,
      amount: Number(amount),
      guest_name: guestName || "Anónimo",
      message: message || null,
      status: "confirmed",
    });

    if (error) throw error;
    return true;
  }

  const giftsGrid = document.getElementById("giftsGrid");
  const giftsLoading = document.getElementById("giftsLoading");
  const messagesList = document.getElementById("messagesList");
  const messagesLoading = document.getElementById("messagesLoading");

  function createGiftCard(gift) {
    const percent = calcPercent(gift);
    const isComplete = percent >= 100;

    const card = document.createElement("article");
    card.className = "gift-card";
    card.dataset.giftId = gift.id;

    card.innerHTML = `
      ${isComplete ? `<span class="gift-card__badge">Completo 🎉</span>` : ""}
      <div class="gift-card__icon" aria-hidden="true">${gift.icon || "💌"}</div>
      <h3 class="gift-card__name">${escapeHtml(gift.name)}</h3>
      <p class="gift-card__desc">${escapeHtml(gift.description)}</p>

      <div class="gift-card__amounts">
        <span class="gift-card__raised">${formatMoney(gift.raisedAmount)}</span>
        <span>de ${formatMoney(gift.targetAmount)}</span>
      </div>

      <div class="progress-bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Progreso de ${escapeHtml(gift.name)}">
        <div class="progress-bar__fill" style="width:${percent}%"></div>
      </div>

      <div class="gift-card__progress-footer">
        <span class="gift-card__percent">${percent}% cumplido</span>
        <span>${percent >= 100 ? "¡Gracias! 💛" : "Cada aporte suma"}</span>
      </div>

      <button class="btn btn--primary gift-card__cta" data-action="open-donate" data-gift-id="${gift.id}">
        Ya transferí / Dejar mensaje
      </button>
    `;

    return card;
  }

  function renderGiftsFromState() {
    giftsGrid.innerHTML = "";
    const fragment = document.createDocumentFragment();
    giftsState.forEach((gift) => fragment.appendChild(createGiftCard(gift)));
    giftsGrid.appendChild(fragment);
  }

  function createMessageCard(donation) {
    const gift = giftsState.find((g) => g.id === donation.giftId);
    const el = document.createElement("article");
    el.className = "message-card";
    el.innerHTML = `
      <p class="message-card__quote">“${escapeHtml(donation.message)}”</p>
      <div class="message-card__meta">
        <span class="message-card__name">${escapeHtml(donation.guestName || "Anónimo")}</span>
        <span>${gift ? escapeHtml(gift.name) : ""}</span>
      </div>
    `;
    return el;
  }

  function renderMessagesFromState() {
    messagesList.innerHTML = "";
    const withMessages = donationsState.filter((d) => d.message && d.message.trim().length > 0);

    if (withMessages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "messages__loading";
      empty.textContent = "Todavía no hay mensajes. ¡Sé el primero en dejar uno!";
      messagesList.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    withMessages.forEach((d) => fragment.appendChild(createMessageCard(d)));
    messagesList.appendChild(fragment);
  }

  async function refreshPageData() {
    giftsState = await getGifts();
    renderGiftsFromState();
    renderMessagesFromState();
  }

  async function initPage() {
    try {
      await refreshPageData();
    } catch (err) {
      if (giftsLoading) giftsLoading.textContent = "No pudimos cargar los regalos. Revisá las políticas de Supabase.";
      if (messagesLoading) messagesLoading.textContent = "No pudimos cargar los mensajes.";
      console.error(err);
    }
  }

  const modalOverlay = document.getElementById("donationModal");
  const modalClose = document.getElementById("modalClose");
  const modalTitle = document.getElementById("modalTitle");
  const modalGiftDesc = document.getElementById("modalGiftDesc");
  const modalProgressFill = document.getElementById("modalProgressFill");
  const modalProgressText = document.getElementById("modalProgressText");
  const amountOptions = document.getElementById("amountOptions");
  const customAmountInput = document.getElementById("customAmount");
  const guestNameInput = document.getElementById("guestName");
  const guestMessageInput = document.getElementById("guestMessage");
  const donationForm = document.getElementById("donationForm");
  const modalError = document.getElementById("modalError");
  const continueBtn = document.getElementById("continueToPayment");

  function openModal(giftId) {
    const gift = giftsState.find((g) => g.id === giftId);
    if (!gift) return;

    selectedGiftId = giftId;
    selectedAmount = null;

    const percent = calcPercent(gift);
    modalTitle.textContent = gift.name;
    modalGiftDesc.textContent = gift.description;
    modalProgressFill.style.width = percent + "%";
    modalProgressText.textContent = `${percent}% · ${formatMoney(gift.raisedAmount)} de ${formatMoney(gift.targetAmount)}`;

    amountOptions.innerHTML = gift.suggestedAmounts
      .map((amt) => `<button type="button" class="amount-chip" data-amount="${amt}">${formatMoney(amt)}</button>`)
      .join("");

    customAmountInput.value = "";
    guestNameInput.value = "";
    guestMessageInput.value = "";
    hideError();

    modalOverlay.classList.add("is-open");
    modalOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modalOverlay.classList.remove("is-open");
    modalOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function hideError() {
    modalError.hidden = true;
    modalError.textContent = "";
  }

  function showError(msg) {
    modalError.hidden = false;
    modalError.textContent = msg;
  }

  amountOptions.addEventListener("click", (e) => {
    const chip = e.target.closest(".amount-chip");
    if (!chip) return;
    selectedAmount = Number(chip.dataset.amount);
    customAmountInput.value = "";
    amountOptions.querySelectorAll(".amount-chip").forEach((c) => c.classList.remove("is-selected"));
    chip.classList.add("is-selected");
    hideError();
  });

  customAmountInput.addEventListener("input", () => {
    const val = Number(customAmountInput.value);
    if (val > 0) {
      selectedAmount = val;
      amountOptions.querySelectorAll(".amount-chip").forEach((c) => c.classList.remove("is-selected"));
      hideError();
    }
  });

  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOverlay.classList.contains("is-open")) closeModal();
  });

  donationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    if (!selectedAmount || selectedAmount < 500) {
      showError("Elegí un monto o ingresá uno personalizado de al menos $500.");
      return;
    }

    continueBtn.disabled = true;
    continueBtn.textContent = "Guardando…";

    try {
      await createDonation({
        giftId: selectedGiftId,
        amount: selectedAmount,
        guestName: guestNameInput.value.trim(),
        message: guestMessageInput.value.trim(),
      });

      closeModal();
      showToast("¡Gracias! Tu aporte y mensaje ya quedaron registrados 💛");
      await refreshPageData();
    } catch (err) {
      console.error(err);
      showError("No se pudo guardar. Revisá las políticas de Supabase o intentá de nuevo.");
    } finally {
      continueBtn.disabled = false;
      continueBtn.textContent = "Confirmar transferencia";
    }
  });

  giftsGrid.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="open-donate"]');
    if (!btn) return;
    openModal(btn.dataset.giftId);
  });

  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3800);
  }

  function subscribeToRealtime() {
    supabaseClient
      .channel("donations-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "donations" },
        () => refreshPageData()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "donations" },
        () => refreshPageData()
      )
      .subscribe();
  }

  initPage();
  subscribeToRealtime();
})();
