/* ==========================================================================
   APP.JS — Lista de regalos de casamiento
   ==========================================================================
   Este archivo es SOLO FRONTEND. Todo lo que ves como "datos de prueba"
   (MOCK_GIFTS, MOCK_DONATIONS) tiene que ser reemplazado por llamadas
   reales a tu backend / Supabase. Los lugares exactos están marcados con
   bloques como este:

       // 🔌 BACKEND AQUÍ ------------------------------------------------

   Flujo de seguridad correcto (NO lo rompas):
   1. El usuario completa el modal y toca "Continuar al pago".
   2. El frontend llama a createDonation() → esto pega contra TU backend
      (no contra Mercado Pago directamente, y JAMÁS con una clave privada
      en este archivo).
   3. Tu backend crea la preferencia de pago en Mercado Pago y devuelve
      una URL de checkout.
   4. redirectToPayment() lleva al usuario a esa URL.
   5. El usuario paga en Mercado Pago (fuera de tu sitio).
   6. Mercado Pago le pega un webhook a TU backend confirmando el pago.
   7. TU backend (no el navegador) actualiza el monto recaudado en Supabase.
   8. El frontend vuelve a pedir los datos (getGifts) o escucha cambios en
      tiempo real (Supabase Realtime) y actualiza la barra de progreso.

   La barra de progreso NUNCA debe actualizarse solo porque el usuario
   hizo clic en "Donar". Eso sería falso: el pago todavía no se confirmó.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------
     CONFIGURACIÓN — acá va lo que conecta con servicios externos
     ------------------------------------------------------------------
     ⚠️ NO PONER ACÁ: claves privadas / secretas de Mercado Pago o de
     Supabase (service_role key). Este archivo lo puede leer cualquiera
     con "Ver código fuente" en el navegador.
     Solo son seguras acá las claves "públicas" / "anon", pensadas para
     el cliente (por ejemplo la anon key de Supabase, que funciona junto
     con Row Level Security).
     ------------------------------------------------------------------ */
  const CONFIG = {
    // 🔌 BACKEND AQUÍ: URL base de tu API propia (Node/Express, Supabase
    // Edge Functions, etc). Todas las funciones de este archivo que dicen
    // "createDonation" o "getGifts" deberían apuntar acá con fetch().
    API_BASE_URL: "https://TU-BACKEND.example.com/api",

    // 🔌 BACKEND AQUÍ: si usás Supabase directo desde el cliente para LEER
    // datos públicos (no para escribir pagos), estas son las credenciales
    // públicas del proyecto. Se consiguen en Supabase > Project Settings > API.
    SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
    SUPABASE_ANON_KEY: "TU_SUPABASE_ANON_KEY",

    CURRENCY: "ARS",
  };

  /* ------------------------------------------------------------------
     DATOS DE PRUEBA (mock)
     ------------------------------------------------------------------
     Reemplazar por datos reales apenas exista el backend. La forma
     (shape) de estos objetos es el "contrato" que tu API debería
     respetar para que el resto del frontend funcione sin cambios.
     ------------------------------------------------------------------ */
  const MOCK_GIFTS = [
    {
      id: "luna-de-miel",
      name: "Luna de miel",
      description: "Ayudanos a llegar un poco más lejos en nuestro primer viaje como casados.",
      icon: "✈️",
      targetAmount: 800000,
      raisedAmount: 512000,
      suggestedAmounts: [5000, 10000, 25000],
    },
    {
      id: "muebles-casa",
      name: "Muebles para la casa",
      description: "Estamos armando nuestro primer hogar juntos, de a poco.",
      icon: "🛋️",
      targetAmount: 600000,
      raisedAmount: 180000,
      suggestedAmounts: [5000, 15000, 30000],
    },
    {
      id: "electrodomesticos",
      name: "Electrodomésticos",
      description: "Desde la pava eléctrica hasta el lavarropas: todo suma.",
      icon: "🔌",
      targetAmount: 500000,
      raisedAmount: 500000,
      suggestedAmounts: [5000, 10000, 20000],
    },
    {
      id: "cena-especial",
      name: "Cena especial",
      description: "Una cena para celebrar nuestro primer aniversario, con velas y todo.",
      icon: "🍽️",
      targetAmount: 150000,
      raisedAmount: 62000,
      suggestedAmounts: [3000, 7000, 15000],
    },
    {
      id: "viaje",
      name: "Viaje",
      description: "Un fondo para nuestra próxima escapada juntos, a donde el mapa nos lleve.",
      icon: "🧳",
      targetAmount: 400000,
      raisedAmount: 96000,
      suggestedAmounts: [5000, 12000, 25000],
    },
    {
      id: "fondo-libre",
      name: "Fondo libre para los novios",
      description: "Si no sabés bien qué elegir, esto nos lo dejamos para lo que más necesitemos.",
      icon: "💌",
      targetAmount: 300000,
      raisedAmount: 140000,
      suggestedAmounts: [3000, 8000, 20000],
    },
  ];

  const MOCK_DONATIONS = [
    { id: "d1", giftId: "luna-de-miel", guestName: "Sofía R.", message: "¡Los queremos mucho! Que este viaje sea inolvidable 💕", amount: 20000, createdAt: "2026-06-02" },
    { id: "d2", giftId: "cena-especial", guestName: "Familia Gómez", message: "Felicidades por este nuevo camino juntos ✨", amount: 10000, createdAt: "2026-06-10" },
    { id: "d3", giftId: "muebles-casa", guestName: "Anónimo", message: "Que su casa se llene de amor y risas.", amount: 15000, createdAt: "2026-06-18" },
    { id: "d4", giftId: "fondo-libre", guestName: "Tío Carlos", message: "¡Salud por los novios! Nos vemos en la fiesta 🥂", amount: 8000, createdAt: "2026-06-20" },
  ];

  // Estado en memoria (simula lo que después vendría del backend)
  let giftsState = JSON.parse(JSON.stringify(MOCK_GIFTS));
  let donationsState = JSON.parse(JSON.stringify(MOCK_DONATIONS));
  let selectedGiftId = null;
  let selectedAmount = null;

  /* ==================================================================
     CAPA DE DATOS — funciones para conectar con el backend
     ==================================================================
     Estas 5 funciones son el "contrato" entre este frontend y tu futuro
     backend. Hoy devuelven datos de prueba (con un delay simulado para
     que se sienta como una llamada de red real). El día que tengas la
     API lista, solo hay que reescribir el CUERPO de cada función: el
     resto de la app (renderGifts, renderMessages, el modal) no necesita
     cambiar porque ya consume estas funciones, no los mocks directamente.
     ================================================================== */

  /**
   * Trae la lista de regalos con sus montos objetivo/recaudado.
   * 🔌 BACKEND AQUÍ:
   *   GET {API_BASE_URL}/gifts
   *   o bien, si leés directo de Supabase:
   *   supabase.from('gifts').select('*')
   */
  async function getGifts() {
    // --- MOCK (borrar cuando haya backend) ---
    await simulateNetworkDelay();
    return giftsState;

    // --- EJEMPLO REAL (descomentar y adaptar) ---
    // const res = await fetch(`${CONFIG.API_BASE_URL}/gifts`);
    // if (!res.ok) throw new Error("No se pudieron cargar los regalos");
    // return await res.json();
  }

  /**
   * Trae las donaciones ya confirmadas (para la sección de mensajes y,
   * opcionalmente, para recalcular el progreso).
   * 🔌 BACKEND AQUÍ:
   *   GET {API_BASE_URL}/donations?status=confirmed
   *   Importante: el backend NUNCA debería devolver donaciones con
   *   status "pending" como si estuvieran confirmadas.
   */
  async function getDonations() {
    // --- MOCK ---
    await simulateNetworkDelay();
    return donationsState;

    // --- EJEMPLO REAL ---
    // const res = await fetch(`${CONFIG.API_BASE_URL}/donations?status=confirmed`);
    // if (!res.ok) throw new Error("No se pudieron cargar los mensajes");
    // return await res.json();
  }

  /**
   * Crea una "intención de donación" en tu backend. Esto NO es el pago
   * en sí: es el paso previo que le dice a tu servidor "un invitado
   * quiere donar tanto a tal regalo". Tu backend es quien, con esta
   * info, arma la preferencia de pago en Mercado Pago y te devuelve la
   * URL de checkout.
   *
   * 🔌 BACKEND AQUÍ:
   *   POST {API_BASE_URL}/donations
   *   body: { giftId, amount, guestName, message }
   *   respuesta esperada: { donationId, checkoutUrl }
   *
   * 🔌 MERCADO PAGO AQUÍ (del lado del backend, no en este archivo):
   *   El backend usa el SDK de Mercado Pago con el ACCESS TOKEN privado
   *   para crear una "Preference" (preferencia de pago), y le pasa como
   *   external_reference el donationId para poder identificarla después
   *   en el webhook.
   */
  async function createDonation({ giftId, amount, guestName, message }) {
    if (!giftId) throw new Error("Falta el regalo seleccionado.");
    if (!amount || amount <= 0) throw new Error("El monto tiene que ser mayor a 0.");

    // --- MOCK (simula lo que devolvería el backend) ---
    await simulateNetworkDelay();
    const donationId = "mock-" + Date.now();
    return {
      donationId,
      // En un backend real esto sería la URL de checkout de Mercado Pago
      // (init_point de la Preference creada).
      checkoutUrl: null, // null = todavía no hay pagos reales conectados
    };

    // --- EJEMPLO REAL ---
    // const res = await fetch(`${CONFIG.API_BASE_URL}/donations`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ giftId, amount, guestName, message }),
    // });
    // if (!res.ok) throw new Error("No se pudo iniciar la donación");
    // return await res.json(); // { donationId, checkoutUrl }
  }

  /**
   * Vuelve a consultar el estado de un regalo puntual. Se usa para
   * refrescar la barra de progreso de una tarjeta sin recargar toda
   * la lista.
   * 🔌 BACKEND AQUÍ:
   *   GET {API_BASE_URL}/gifts/{giftId}
   *
   * 🔌 SUPABASE REALTIME AQUÍ (alternativa recomendada):
   *   En vez de "preguntar" (polling), te podés suscribir a cambios:
   *
   *   supabase
   *     .channel('gifts-progress')
   *     .on('postgres_changes',
   *       { event: 'UPDATE', schema: 'public', table: 'gifts' },
   *       (payload) => updateProgress(payload.new.id, payload.new)
   *     )
   *     .subscribe();
   *
   *   Así, cuando el backend actualiza Supabase tras el webhook de
   *   Mercado Pago, esta página recibe el cambio sola y actualiza la
   *   barra en tiempo real, sin que el usuario haga nada.
   */
  async function updateProgress(giftId, freshData) {
    const gift = giftsState.find((g) => g.id === giftId);
    if (!gift) return;

    if (freshData) {
      Object.assign(gift, freshData);
    } else {
      // --- MOCK: sin backend, no hay nada nuevo que traer ---
      await simulateNetworkDelay(200);
    }
    renderGiftCard(gift);
  }

  /**
   * Lleva al usuario a la pasarela de pago (Mercado Pago Checkout Pro,
   * por ejemplo). Esta función NUNCA debería construir el link de pago
   * por sí sola: el link (checkoutUrl) tiene que venir siempre del
   * backend, ya generado con datos válidos y firmados del lado del
   * servidor.
   * 🔌 MERCADO PAGO AQUÍ: la URL real de checkout (init_point) viene de
   *   la respuesta de createDonation().
   */
  function redirectToPayment(checkoutUrl) {
    if (!checkoutUrl) {
      // Estado actual: todavía no hay integración de pagos real.
      showToast("Demo: acá se redirigiría a Mercado Pago para completar el pago 💳");
      return;
    }
    window.location.href = checkoutUrl;
  }

  function simulateNetworkDelay(ms = 450) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ==================================================================
     UTILIDADES DE FORMATO
     ================================================================== */
  const currencyFormatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: CONFIG.CURRENCY,
    maximumFractionDigits: 0,
  });

  function formatMoney(amount) {
    return currencyFormatter.format(amount);
  }

  function calcPercent(gift) {
    if (!gift.targetAmount) return 0;
    return Math.min(100, Math.round((gift.raisedAmount / gift.targetAmount) * 100));
  }

  /* ==================================================================
     RENDERIZADO — REGALOS
     ================================================================== */
  const giftsGrid = document.getElementById("giftsGrid");
  const giftsLoading = document.getElementById("giftsLoading");

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
        Donar
      </button>
    `;

    return card;
  }

  function renderGiftCard(gift) {
    const existing = giftsGrid.querySelector(`[data-gift-id="${gift.id}"]`);
    if (!existing) return;
    existing.replaceWith(createGiftCard(gift));
  }

  async function renderGifts() {
    try {
      const gifts = await getGifts();
      giftsState = gifts;
      giftsLoading.remove();
      const fragment = document.createDocumentFragment();
      gifts.forEach((gift) => fragment.appendChild(createGiftCard(gift)));
      giftsGrid.appendChild(fragment);
    } catch (err) {
      giftsLoading.textContent = "No pudimos cargar los regalos. Probá de nuevo más tarde.";
      console.error(err);
    }
  }

  /* ==================================================================
     RENDERIZADO — MENSAJES DE INVITADOS
     ================================================================== */
  const messagesList = document.getElementById("messagesList");
  const messagesLoading = document.getElementById("messagesLoading");

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

  async function renderMessages() {
    try {
      const donations = await getDonations();
      donationsState = donations;
      const withMessages = donations.filter((d) => d.message && d.message.trim().length > 0);

      messagesLoading.remove();

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
    } catch (err) {
      messagesLoading.textContent = "No pudimos cargar los mensajes.";
      console.error(err);
    }
  }

  /* ==================================================================
     MODAL DE DONACIÓN
     ================================================================== */
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

    if (!selectedAmount || selectedAmount <= 0) {
      showError("Elegí un monto o ingresá uno personalizado.");
      return;
    }

    continueBtn.disabled = true;
    continueBtn.textContent = "Procesando…";

    try {
      const { checkoutUrl } = await createDonation({
        giftId: selectedGiftId,
        amount: selectedAmount,
        guestName: guestNameInput.value.trim(),
        message: guestMessageInput.value.trim(),
      });

      closeModal();
      // Importante: NO tocamos la barra de progreso acá. El progreso
      // solo se actualiza cuando el backend confirma el pago (ver
      // updateProgress() y la explicación del flujo al inicio del archivo).
      redirectToPayment(checkoutUrl);
    } catch (err) {
      showError(err.message || "No pudimos procesar la donación. Probá de nuevo.");
    } finally {
      continueBtn.disabled = false;
      continueBtn.textContent = "Continuar al pago";
    }
  });

  /* ==================================================================
     DELEGACIÓN DE EVENTOS — botones "Donar" de cada tarjeta
     ================================================================== */
  giftsGrid.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="open-donate"]');
    if (!btn) return;
    openModal(btn.dataset.giftId);
  });

  /* ==================================================================
     TOAST
     ================================================================== */
  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3800);
  }

  /* ==================================================================
     HELPERS
     ================================================================== */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  /* ==================================================================
     INIT
     ================================================================== */
  renderGifts().then(renderMessages);

  /*
   * 🔌 BACKEND AQUÍ (opcional, recomendado): reemplazar este polling
   * de ejemplo por una suscripción real de Supabase Realtime (ver el
   * comentario dentro de updateProgress más arriba). Dejamos este
   * setInterval comentado como referencia de "peor escenario" (polling)
   * por si no querés usar websockets todavía.
   *
   * setInterval(async () => {
   *   const gifts = await getGifts();
   *   giftsState = gifts;
   *   gifts.forEach(renderGiftCard);
   * }, 15000);
   */
})();
