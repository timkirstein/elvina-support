// /presentkort page only — not loaded globally from default.html (unlike
// ref-tracking.js/meta-pixel.js/google-ads.js), since nothing else on the
// site needs a Stripe Checkout call.
const ENDPOINT =
  "https://europe-west1-grapemate-f80e3.cloudfunctions.net/createGiftcardCheckoutSession";

/** Reads utm_source/utm_medium/utm_campaign/utm_content from the URL — no persistence needed, this page is itself the checkout initiator. */
function getUtmParams() {
  const params = new URLSearchParams(window.location.search);
  const out = {};
  const utmSource = params.get("utm_source");
  const utmMedium = params.get("utm_medium");
  const utmCampaign = params.get("utm_campaign");
  const utmContent = params.get("utm_content");
  if (utmSource) out.utmSource = utmSource;
  if (utmMedium) out.utmMedium = utmMedium;
  if (utmCampaign) out.utmCampaign = utmCampaign;
  if (utmContent) out.utmContent = utmContent;
  return out;
}

const PREVIEW_TO_DEFAULT = "Till dig";
const PREVIEW_MESSAGE_DEFAULT = "Din personliga hälsning visas här på presentkortet.";

/** Mirrors the name/message fields live onto the gift-card mockup at the top of the purchase card. */
function initLivePreview() {
  const recipientInput = document.getElementById("recipientName");
  const messageInput = document.getElementById("message");
  const previewTo = document.getElementById("previewTo");
  const previewMessage = document.getElementById("previewMessage");
  if (!recipientInput || !messageInput || !previewTo || !previewMessage) return;

  recipientInput.addEventListener("input", () => {
    const name = recipientInput.value.trim();
    previewTo.textContent = name ? `Till ${name}` : PREVIEW_TO_DEFAULT;
  });
  messageInput.addEventListener("input", () => {
    const message = messageInput.value.trim();
    previewMessage.textContent = message || PREVIEW_MESSAGE_DEFAULT;
  });
}

function initGiftcardForm() {
  const form = document.getElementById("giftcard-form");
  if (!form) return;

  const submitBtn = document.getElementById("giftcard-submit");
  const errorEl = document.getElementById("giftcard-error");
  const messageInput = document.getElementById("message");
  const messageCount = document.getElementById("messageCount");
  const recipientInput = document.getElementById("recipientName");
  const submitLabel = submitBtn.textContent;

  if (messageInput && messageCount) {
    messageInput.addEventListener("input", () => {
      messageCount.textContent = String(messageInput.value.length);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Laddar…";

    const recipientName = recipientInput.value.trim();
    const message = messageInput.value.trim();

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Tells the backend this is Elvina: SEK price, Swedish PDF/email,
          // ELVINA- code, return to elvina.se/presentkort.
          marketId: "se",
          ...(recipientName ? { recipientName } : {}),
          ...(message ? { message } : {}),
          ...getUtmParams(),
        }),
      });
      if (!response.ok) {
        throw new Error(`Oväntat svar från betaltjänsten (${response.status})`);
      }
      const data = await response.json();
      if (!data.sessionUrl) {
        throw new Error("Betalningslänk saknas i svaret");
      }
      window.location.href = data.sessionUrl;
    } catch (err) {
      console.error("Kunde inte starta betalningen för presentkortet", err);
      errorEl.textContent = "Kunde inte starta betalningen. Försök igen om en stund.";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });
}

/** Swaps the form for a thank-you card when Stripe redirects back with ?purchased=1. */
function showPurchasedBannerIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("purchased") !== "1") return;

  const card = document.getElementById("giftcard-card-wrap");
  const success = document.getElementById("giftcard-success");
  if (card) card.hidden = true;
  if (success) success.hidden = false;
}

function init() {
  initLivePreview();
  initGiftcardForm();
  showPurchasedBannerIfNeeded();
}

init();
