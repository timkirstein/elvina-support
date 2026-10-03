import { hasAnalyticsConsent, onConsentAccepted } from "./cookie-consent.js";
import { getRef, utmEventParams } from "./ref-tracking.js";

// Same dataset as the Savino-web pixel and the Meta CAPI events sent from
// the Stripe webhook — keeps app, web and landing-page conversions unified
// under one Meta dataset.
// TODO (Elvina): Savinos Meta-dataset är avstängt här. Fyll i Elvinas
// pixel-ID när det finns ett eget Meta-konto/dataset för Elvina.
const PIXEL_ID = "";

/** Loads fbevents.js and fires the initial PageView, tagged with the current ref (if any). */
function bootstrapPixel() {
  if (typeof window === "undefined" || window.fbq) return;

  const fbq = function (...args) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue.push(args);
    }
  };
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  window.fbq("init", PIXEL_ID);

  const ref = getRef();
  window.fbq("track", "PageView", { ...(ref ? { ref } : {}), ...utmEventParams() });
}

/** Delegated click listener for every "Last ned"-button on the site — mirrors ref-tracking.js's download_click. */
function attachDownloadClickTracking() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest('[data-track="download_click"]');
    if (!target) return;
    if (!hasAnalyticsConsent() || !window.fbq) return;

    const ref = getRef();
    const store = target.dataset.store || "unknown";
    window.fbq("track", "Lead", {
      content_name: "app_download",
      store,
      ...(ref ? { ref } : {}),
      ...utmEventParams(),
    });
  });
}

function init() {
  if (!PIXEL_ID) return;
  attachDownloadClickTracking();

  if (hasAnalyticsConsent()) {
    bootstrapPixel();
  } else {
    onConsentAccepted(bootstrapPixel);
  }
}

init();
