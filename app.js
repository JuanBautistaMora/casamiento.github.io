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
    const el = document.createElement("article");
    el.className = "message-card";
    el.innerHTML = `
      <p class="message-card__quote">“${escapeHtml(donation.message)}”</p>
      <div class="message-card__meta">
        <span class="message-card__name">${escapeHtml(donation.guestName || "Anónimo")}</span>
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

    const socialLinks = document.createElement("nav");
    socialLinks.className = "footer__socials";
    socialLinks.setAttribute("aria-label", "Redes y contacto de Juan Bautista Mora");

    const socials = [
      {
        label: "GitHub",
        href: "https://github.com/JuanBautistaMora",
        path: "M12 .297a12 12 0 0 0-3.79 23.39c.6.113.82-.258.82-.577v-2.234c-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.604-2.665-.305-5.466-1.332-5.466-5.93 0-1.31.468-2.381 1.235-3.221-.123-.303-.535-1.527.117-3.176 0 0 1.008-.322 3.301 1.23a11.5 11.5 0 0 1 6.003 0c2.291-1.552 3.297-1.23 3.297-1.23.653 1.65.243 2.874.12 3.176.77.84 1.233 1.91 1.233 3.221 0 4.61-2.806 5.62-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.216.694.825.576A12 12 0 0 0 12 .297Z",
      },
      {
        label: "Instagram",
        href: "https://www.instagram.com/bautista.moraa/",
        path: "M7.547 0C3.384 0 0 3.384 0 7.547v8.906C0 20.616 3.384 24 7.547 24h8.906C20.616 24 24 20.616 24 16.453V7.547C24 3.384 20.616 0 16.453 0Zm-.25 2h9.406A5.303 5.303 0 0 1 22 7.297v9.406A5.303 5.303 0 0 1 16.703 22H7.297A5.303 5.303 0 0 1 2 16.703V7.297A5.303 5.303 0 0 1 7.297 2Zm9.886 2.165a1.656 1.656 0 1 0 0 3.312 1.656 1.656 0 0 0 0-3.312ZM12 5.838A6.162 6.162 0 1 0 12 18.162 6.162 6.162 0 0 0 12 5.838Zm0 2a4.162 4.162 0 1 1 0 8.324 4.162 4.162 0 0 1 0-8.324Z",
      },
      {
        label: "WhatsApp",
        href: "https://wa.me/5491132717042",
        path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.58-.487-.501-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.075-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.625.712.227 1.36.195 1.871.118.57-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.436-9.887 9.89-9.887 2.641 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.993c-.003 5.45-4.445 9.885-9.892 9.885m8.413-18.297A11.82 11.82 0 0 0 12.283.003C5.764.003.456 5.31.453 11.826a11.8 11.8 0 0 0 1.579 5.903L.354 23.86l6.275-1.645a11.86 11.86 0 0 0 5.65 1.44h.005c6.52 0 11.828-5.307 11.831-11.824a11.82 11.82 0 0 0-3.465-8.379Z",
      },
    ];

    socials.forEach(({ label, href, path }) => {
      const link = document.createElement("a");
      link.className = "footer__social-link";
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", label);
      link.title = label;
      link.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"></path></svg>`;
      socialLinks.appendChild(link);
    });

    footer.append(credit, socialLinks);
  }

  initPage();
 // subscribeToRealtime();
})();
