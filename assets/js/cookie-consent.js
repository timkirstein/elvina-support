const CONSENT_KEY = "savino_cookie_consent";
const ACCEPTED_EVENT = "savino:consent-accepted";

export function getConsent() {
  const value = localStorage.getItem(CONSENT_KEY);
  return value === "accepted" || value === "declined" ? value : null;
}

export function setConsent(value) {
  localStorage.setItem(CONSENT_KEY, value);
}

export function hasAnalyticsConsent() {
  return getConsent() === "accepted";
}

/** Fires once, the moment the user clicks "Godta" (this visit or a prior one). */
export function onConsentAccepted(callback) {
  window.addEventListener(ACCEPTED_EVENT, callback);
}

function announceAccepted() {
  window.dispatchEvent(new CustomEvent(ACCEPTED_EVENT));
}

/** Wires up the banner markup from _includes/cookie-consent.html, if present on this page. */
export function initCookieConsentBanner() {
  const banner = document.getElementById("savino-consent-banner");
  const existing = getConsent();

  if (existing === "accepted") {
    announceAccepted();
    return;
  }
  if (existing === "declined" || !banner) {
    return;
  }

  banner.hidden = false;

  const acceptBtn = banner.querySelector("[data-consent-accept]");
  const declineBtn = banner.querySelector("[data-consent-decline]");

  acceptBtn?.addEventListener("click", () => {
    setConsent("accepted");
    banner.hidden = true;
    announceAccepted();
  });

  declineBtn?.addEventListener("click", () => {
    setConsent("declined");
    banner.hidden = true;
  });
}

initCookieConsentBanner();
