/* ==========================================================================
   APP.JS — Lista de regalos de casamiento con transferencias
   ========================================================================== */
(function () {
  "use strict";

  const CONFIG = {
    SUPABASE_URL: "https://qdcezlxwnnfjwhceoybe.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkY2V6bHh3bm5mandoY2VveWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTkxNzEsImV4cCI6MjA5OTEzNTE3MX0.ubCmhihpJ5uUNDKFVoljcLtYuAGZ0IaMq8Jxm6qYx_U",
    CURRENCY: "ARS",
    MIN_AMOUNT: 500,
    MAX_AMOUNT: 5000000,
  };

  const GIFT_ORDER = [
    "juego-comedor",
    "sillon",
    "vajilla-completa",
    "mesas-luz",
    "sommier",
    "ropa-cama",
    "ramo-novia",
    "flores-iglesia",
    "alianzas",
    "fondo-novios",
    "luna-miel",
  ];
  const giftOrderIndex = new Map(GIFT_ORDER.map((id, index) => [id, index]));

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
      icon: gift.icon,
      targetAmount: Number(gift.target_amount || 0),
      raisedAmount: Number(raisedAmount || 0),
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
      supabaseClient
        .from("gifts")
        .select("id, name, icon, target_amount")
        .in("id", GIFT_ORDER),
      getDonations(),
    ]);

    if (giftsError) throw giftsError;

    const totalsByGift = donations.reduce((acc, donation) => {
      acc[donation.giftId] = (acc[donation.giftId] || 0) + donation.amount;
      return acc;
    }, {});

    donationsState = donations;
    return (gifts || [])
      .map((gift) => normalizeGift(gift, totalsByGift[gift.id] || 0))
      .sort((a, b) => giftOrderIndex.get(a.id) - giftOrderIndex.get(b.id));
  }

  async function createDonation({ giftId, amount, guestName, message }) {
    if (!giftId) throw new Error("Falta el regalo seleccionado.");
    if (!amount || amount < CONFIG.MIN_AMOUNT || amount > CONFIG.MAX_AMOUNT) {
      throw new Error("El monto ingresado está fuera del rango permitido.");
    }

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
    const hasGoal = gift.targetAmount > 0;
    const isComplete = hasGoal && percent >= 100;

    const card = document.createElement("article");
    card.className = `gift-card${hasGoal ? "" : " gift-card--open"}`;
    card.dataset.giftId = gift.id;

    card.innerHTML = `
      ${isComplete ? `<span class="gift-card__badge">Completo 🎉</span>` : ""}
      <div class="gift-card__icon" aria-hidden="true">${gift.icon || "💌"}</div>
      <h3 class="gift-card__name">${escapeHtml(gift.name)}</h3>
      ${hasGoal ? `
        <p class="gift-card__goal">Objetivo: <strong>${formatMoney(gift.targetAmount)}</strong> · <strong>${percent}% completado</strong></p>
        <div class="progress-bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Progreso de ${escapeHtml(gift.name)}">
          <div class="progress-bar__fill" style="width:${percent}%"></div>
        </div>
      ` : `
        <p class="gift-card__goal gift-card__goal--open">Sin objetivo determinado</p>
      `}

      <button class="btn btn--primary gift-card__cta" data-action="open-donate" data-gift-id="${gift.id}">
        Regalar
      </button>
    `;

    return card;
  }

  function renderGiftsFromState() {
    giftsGrid.innerHTML = "";

    if (giftsState.length === 0) {
      const empty = document.createElement("p");
      empty.className = "gifts__loading";
      empty.textContent = "Todavía no hay regalos disponibles.";
      giftsGrid.appendChild(empty);
      return;
    }

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
  const modalProgress = document.getElementById("modalProgress");
  const modalProgressFill = document.getElementById("modalProgressFill");
  const modalProgressText = document.getElementById("modalProgressText");
  const customAmountInput = document.getElementById("customAmount");
  const guestNameInput = document.getElementById("guestName");
  const guestMessageInput = document.getElementById("guestMessage");
  const donationForm = document.getElementById("donationForm");
  const modalError = document.getElementById("modalError");
  const continueBtn = document.getElementById("continueToPayment");
  const modalEyebrow = modalOverlay.querySelector(".modal__eyebrow");
  const modalDialog = modalOverlay.querySelector(".modal");
  const transferBox = modalOverlay.querySelector(".transfer-box");
  const transferNote = transferBox.querySelector(".transfer-box__note");

  const transferStep = document.createElement("section");
  transferStep.className = "modal__transfer-step";
  transferStep.hidden = true;
  transferStep.setAttribute("aria-label", "Datos para transferir");

  const transferSummary = document.createElement("p");
  transferSummary.className = "transfer-step__summary";

  const transferError = document.createElement("p");
  transferError.className = "transfer-step__error";
  transferError.setAttribute("role", "alert");
  transferError.hidden = true;

  const transferActions = document.createElement("div");
  transferActions.className = "transfer-step__actions";

  const closeTransferBtn = document.createElement("button");
  closeTransferBtn.type = "button";
  closeTransferBtn.className = "btn btn--primary";
  closeTransferBtn.textContent = "Cerrar";

  modalDialog.insertBefore(transferStep, transferBox);
  transferActions.append(closeTransferBtn);
  transferStep.append(transferSummary, transferBox, transferError, transferActions);

  function hideTransferError() {
    transferError.hidden = true;
    transferError.textContent = "";
  }

  function showTransferError(message) {
    transferError.hidden = false;
    transferError.textContent = message;
  }

  function showAmountStep(focus = true) {
    transferStep.hidden = true;
    donationForm.hidden = false;
    modalEyebrow.textContent = "Regalar";
    continueBtn.textContent = "Confirmar monto";
    hideTransferError();
    if (focus) requestAnimationFrame(() => customAmountInput.focus());
  }

  function showTransferStep() {
    const gift = giftsState.find((item) => item.id === selectedGiftId);
    donationForm.hidden = true;
    transferStep.hidden = false;
    modalEyebrow.textContent = "Transferencia";
    transferSummary.textContent = `Vas a transferir ${formatMoney(selectedAmount)} para ${gift ? gift.name : "este regalo"}.`;
    transferNote.textContent = "El aporte ya quedó registrado. Usá estos datos para realizar la transferencia.";
    hideTransferError();
    requestAnimationFrame(() => closeTransferBtn.focus());
  }

  function openModal(giftId) {
    const gift = giftsState.find((g) => g.id === giftId);
    if (!gift) return;

    selectedGiftId = giftId;
    selectedAmount = null;

    const percent = calcPercent(gift);
    const hasGoal = gift.targetAmount > 0;
    modalTitle.textContent = gift.name;
    modalProgressFill.style.width = percent + "%";
    modalProgressFill.parentElement.hidden = !hasGoal;
    modalProgress.classList.toggle("modal__progress-mini--open", !hasGoal);
    modalProgressText.textContent = hasGoal
      ? `Objetivo: ${formatMoney(gift.targetAmount)} · ${percent}% completado`
      : "Sin objetivo determinado";

    customAmountInput.value = "";
    guestNameInput.value = "";
    guestMessageInput.value = "";
    hideError();
    hideTransferError();
    showAmountStep(false);

    modalOverlay.classList.add("is-open");
    modalOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    modalDialog.scrollTop = 0;
    requestAnimationFrame(() => customAmountInput.focus());
  }

  function closeModal() {
    modalOverlay.classList.remove("is-open");
    modalOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    showAmountStep(false);
  }

  function hideError() {
    modalError.hidden = true;
    modalError.textContent = "";
  }

  function showError(msg) {
    modalError.hidden = false;
    modalError.textContent = msg;
  }

  customAmountInput.addEventListener("input", () => {
    const val = Number(customAmountInput.value);
    if (val > 0) {
      selectedAmount = val;
      hideError();
    } else {
      selectedAmount = null;
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

    if (!selectedAmount || selectedAmount < CONFIG.MIN_AMOUNT || selectedAmount > CONFIG.MAX_AMOUNT) {
      showError("Ingresá un monto entre $500 y $5.000.000.");
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

      showTransferStep();
      modalDialog.scrollTop = 0;
      showToast("Aporte registrado. Ahora podés realizar la transferencia.");
      refreshPageData().catch((err) => console.error(err));
    } catch (err) {
      console.error(err);
      showError("No se pudo registrar el aporte. Revisá las políticas de Supabase o intentá de nuevo.");
    } finally {
      continueBtn.disabled = false;
      continueBtn.textContent = "Confirmar monto";
    }
  });

  closeTransferBtn.addEventListener("click", closeModal);

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

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  document.addEventListener("click", async (e) => {
    const copyButton = e.target.closest("[data-copy-value]");
    if (!copyButton) return;

    const originalLabel = copyButton.textContent;
    try {
      await copyText(copyButton.dataset.copyValue);
      copyButton.textContent = "¡Copiado!";
      copyButton.classList.add("is-copied");
      setTimeout(() => {
        copyButton.textContent = originalLabel;
        copyButton.classList.remove("is-copied");
      }, 1800);
    } catch (err) {
      console.error(err);
      showToast("No se pudo copiar. Mantené presionado el dato para copiarlo.");
    }
  });

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

  const footer = document.querySelector(".footer");
  if (footer && !footer.querySelector(".footer__credit")) {
    const credit = document.createElement("p");
    credit.className = "footer__credit";
    credit.textContent = "Hecho por Juan Bautista Mora";
    footer.appendChild(credit);
  }

  initPage();
 // subscribeToRealtime();
})();
