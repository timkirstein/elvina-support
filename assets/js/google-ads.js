import { hasAnalyticsConsent, onConsentAccepted } from "./cookie-consent.js";

// Google Ads conversion tracking (Search-1 campaign) — "Utgående klick" /
// "Klick på nedladdningsknapp" conversion action, savino.no.
// TODO (Elvina): Savinos Google Ads-konto är avstängt här. Fyll i Elvinas
// konverterings-ID och etikett när det finns ett Ads-konto för Elvina.
const AW_ID = "";
const CONVERSION_LABEL = "";

/**
 * Consent Mode v2 state object. Before "Godta", every signal is "denied" —
 * gtag.js still loads and fires, but sends only a cookieless, non-identifying
 * ping that Google Ads can use for conversion modeling instead of dropping
 * the event entirely (which is what happened before this: the tag never
 * loaded at all for a non-consenting visitor, so 0 signal ever reached
 * Google Ads for anyone who clicked "Last ned" without first clicking
 * "Godta" on the cookie banner).
 */
function consentState(granted) {
  return {
    ad_storage: granted ? "granted" : "denied",
    ad_user_data: granted ? "granted" : "denied",
    ad_personalization: granted ? "granted" : "denied",
    analytics_storage: granted ? "granted" : "denied",
  };
}

/** Loads gtag.js and configures the Google Ads tag. Runs for every visitor, consenting or not — see consentState() above. */
function bootstrapGoogleAds() {
  if (typeof window === "undefined" || window.gtag) return;

  window.dataLayer = window.dataLayer || [];
  function gtag(...args) {
    window.dataLayer.push(args);
  }
  window.gtag = gtag;

  // Must be set before the tag script loads and before any config/event call.
  gtag("consent", "default", consentState(hasAnalyticsConsent()));

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${AW_ID}`;
  document.head.appendChild(script);

  gtag("js", new Date());
  gtag("config", AW_ID);
}

/** Delegated click listener for every "Last ned"-button on the site — mirrors meta-pixel.js's download_click. */
function attachDownloadClickTracking() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest('[data-track="download_click"]');
    if (!target || !window.gtag) return;

    // No consent check here on purpose: gtag.js itself respects whatever
    // consent state was set via consentState() above, sending either a full
    // conversion event (granted) or a modeled, cookieless ping (denied).
    window.gtag("event", "conversion", {
      send_to: CONVERSION_LABEL,
      value: 1.0,
      currency: "NOK",
    });
  });
}

function init() {
  attachDownloadClickTracking();
  bootstrapGoogleAds();

  onConsentAccepted(() => {
    window.gtag?.("consent", "update", consentState(true));
  });
}

init();
