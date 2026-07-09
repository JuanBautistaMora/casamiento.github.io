/* ==========================================================================
   APP.JS — Lista de regalos de casamiento
   ========================================================================== */

(function () {
  "use strict";

  const CONFIG = {
    SUPABASE_URL: "https://qdcezlxwnnfjwhceoybe.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InFkY2V6bHh3bm5mandoY2VveWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTkxNzEsImV4cCI6MjA5OTEzNTE3MX0.ubCmhihpJ5uUNDKFVoljcLtYuAGZ0IaMq8Jxm6qYx_U",
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

  async function getDonations() {
    const { data, error } = await supabaseClient
      .from("donations")
      .select("*")
      .eq("status", "confirmed")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return data.map((d) => ({
      id: d.id,
      giftId: d.gift_id,
      amount: Number(d.amount),
      guestName: d.guest_name,
      message: d.message,
      createdAt: d.created_at,
    }));
  }

  async function getGifts() {
    const { data, error } = await supabaseClient
      .from("gifts")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    donationsState = await getDonations();

    return data.map((g) => {
      const raisedFromDonations = donationsState
        .filter((d) => d.giftId === g.id)
        .reduce((total, d) => total + d.amount, 0);

      return {
        id: g.id,
        name: g.name,
        description: g.description,
        icon: g.icon,
        targetAmount: Number(g.target_amount),
        raisedAmount: raisedFromDonations,
        suggestedAmounts: g.suggested_amounts || [],
      };
    });
  }

  async function createDonation({ giftId, amount, guestName, message }) {
    if (!giftId) throw new Error("Falta el regalo seleccionado.");
    if (!amount || amount < 500) throw new Error("El monto mínimo es de $500.");

    const safeName = guestName?.trim() || "Anónimo";
    const safeMessage = message?.trim() || "";

    const { data, error } = await supabaseClient
      .from("donations")
      .insert({
        gift_id: giftId,
        amount,
        guest_name: safeName.slice(0, 80),
        message: safeMessage.slice(0, 280),
        status: "confirmed",
      })
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  async function refreshAll() {
    const gifts = await getGifts();
    giftsState = gifts;
    renderGiftsList(gifts);
    renderMessagesList(donationsState);
  }

  const currencyFormatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: CONFIG.CURRENCY,
    maximumFractionDigits: 0,
  });

  function formatMoney(amount) {
    return currencyFormatter.format(amount || 0);
  }

  function calcPercent(gift) {
    if (!gift.targetAmount) return 0;
    return Math.min(100, Math.round((gift.raisedAmount / gift.targetAmount) * 100));
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
      <div class="gift-card__icon" aria-hidden="true">${gift.icon}</div>
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
        Aportar
      </button>
    `;

    return card;
  }

  function renderGiftsList(gifts) {
    giftsLoading?.remove();
    giftsGrid.innerHTML = "";
    const fragment = document.createDocumentFragment();
    gifts.forEach((gift) => fragment.appendChild(createGiftCard(gift)));
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

  function renderMessagesList(donations) {
    messagesLoading?.remove();
    messagesList.innerHTML = "";

    const withMessages = donations.filter((d) => d.message && d.message.trim().length > 0);

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
    continueBtn.textContent = "Guardando aporte…";

    try {
      await createDonation({
        giftId: selectedGiftId,
        amount: selectedAmount,
        guestName: guestNameInput.value,
        message: guestMessageInput.value,
      });

      closeModal();
      showToast("¡Gracias! Tu aporte y mensaje ya aparecen en la página 💛");
      await refreshAll();
    } catch (err) {
      console.error(err);
      showError("No pudimos guardar el aporte. Revisá la conexión o las políticas de Supabase.");
    } finally {
      continueBtn.disabled = false;
      continueBtn.textContent = "Confirmar aporte";
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
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4200);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function subscribeToDonations() {
    supabaseClient
      .channel("public-donations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "donations" },
        () => refreshAll()
      )
      .subscribe();
  }

  refreshAll().then(subscribeToDonations).catch((err) => {
    console.error(err);
    if (giftsLoading) giftsLoading.textContent = "No pudimos cargar los regalos.";
    if (messagesLoading) messagesLoading.textContent = "No pudimos cargar los mensajes.";
  });
})();
