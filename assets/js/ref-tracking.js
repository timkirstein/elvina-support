import { hasAnalyticsConsent, onConsentAccepted } from "./cookie-consent.js";

// Marknadsmärkning så att Elvina-trafik går att skilja från savino.no i
// samma Firebase-projekt (Analytics + referrals-samlingen).
const MARKET_PARAMS = { market: "se", site: "elvina.se" };

const REF_KEY = "savino_ref";
const UTM_KEY = "savino_utm";

/** The persisted campaign ref (e.g. "meta_aug2026"), if one was ever captured. */
export function getRef() {
  return localStorage.getItem(REF_KEY) || null;
}

/** The persisted standard UTM params ({source, medium, campaign, content}), if any were ever captured — sparse, only present keys are included. */
export function getUtm() {
  try {
    const raw = localStorage.getItem(UTM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const firebaseConfig = {
  apiKey: "AIzaSyCoNj8jhauPfhoVr-XBSH5DWcjH4he5IaA",
  authDomain: "grapemate-f80e3.firebaseapp.com",
  projectId: "grapemate-f80e3",
  storageBucket: "grapemate-f80e3.firebasestorage.app",
  messagingSenderId: "139205326696",
  appId: "1:139205326696:web:2471fecec63f6eef5388dd",
  measurementId: "G-GGS48F5ZSE",
};

// reCAPTCHA v3 site key for App Check — same key + "digital_somelier_v2 (web)"
// App Check app as Savino-web/savino-b2b (same appId above). savino.no (this
// site's domain, per CNAME) is allow-listed for this key in the reCAPTCHA
// admin console alongside app.savino.no, savino-b2b.web.app, and localhost.
// TODO (Elvina): lägg till elvina.se i reCAPTCHA-konsolens domänlista för den
// här nyckeln, annars nekas App Check och inga referrals sparas.
const RECAPTCHA_SITE_KEY = "6LcWMJAtAAAAAHeeTECZFO-U8h19XfkTWKw5KMaj";

let firebaseHandlesPromise = null;

/** Lazily loads + initializes Firebase (App Check + Analytics + Firestore) — only ever called once consent is granted. */
function getFirebaseHandles() {
  if (!firebaseHandlesPromise) {
    firebaseHandlesPromise = (async () => {
      const [
        { initializeApp },
        { initializeAppCheck, ReCaptchaV3Provider },
        { getAnalytics, logEvent },
        { getFirestore, collection, addDoc, serverTimestamp },
      ] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app-check.js"),
        import("https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js"),
        import("https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"),
      ]);
      const app = initializeApp(firebaseConfig);
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
      return {
        analytics: getAnalytics(app),
        db: getFirestore(app),
        logEvent,
        collection,
        addDoc,
        serverTimestamp,
      };
    })();
  }
  return firebaseHandlesPromise;
}

function captureRefFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref")?.trim().toLowerCase();
  return ref || null;
}

/** Reads utm_source/utm_medium/utm_campaign/utm_content from the URL, sparse, only present params are included. Returns null if none are present. */
function captureUtmFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const out = {};
  const source = params.get("utm_source")?.trim();
  const medium = params.get("utm_medium")?.trim();
  const campaign = params.get("utm_campaign")?.trim();
  const content = params.get("utm_content")?.trim();
  if (source) out.source = source;
  if (medium) out.medium = medium;
  if (campaign) out.campaign = campaign;
  if (content) out.content = content;
  return Object.keys(out).length > 0 ? out : null;
}

function isLandingPage() {
  return window.location.pathname === "/" || window.location.pathname === "/index.html";
}

/** Flattens the persisted UTM object (if any) into {utm_source, utm_medium, ...} for spreading into an analytics event. */
export function utmEventParams() {
  const utm = getUtm();
  if (!utm) return {};
  const out = {};
  if (utm.source) out.utm_source = utm.source;
  if (utm.medium) out.utm_medium = utm.medium;
  if (utm.campaign) out.utm_campaign = utm.campaign;
  if (utm.content) out.utm_content = utm.content;
  return out;
}

/** Captures ?ref= and standard UTM params on the landing page, persists both, and logs a landing_page_visit event + referrals doc. */
async function trackLandingPageRef() {
  if (!isLandingPage()) return;
  const ref = captureRefFromUrl();
  const utm = captureUtmFromUrl();
  if (!ref && !utm) return;

  if (ref) localStorage.setItem(REF_KEY, ref);
  if (utm) localStorage.setItem(UTM_KEY, JSON.stringify(utm));

  const { analytics, db, logEvent, collection, addDoc, serverTimestamp } = await getFirebaseHandles();
  const eventParams = { ...MARKET_PARAMS, ...(ref ? { ref } : {}), ...utmEventParams() };
  logEvent(analytics, "landing_page_visit", eventParams);
  try {
    await addDoc(collection(db, "referrals"), { ...eventParams, timestamp: serverTimestamp() });
  } catch (err) {
    console.error("Kunde inte spara referral i Firestore", err);
  }
}

/** Delegated click listener for every "Last ned"-button on the site. */
function attachDownloadClickTracking() {
  document.addEventListener("click", async (event) => {
    const target = event.target.closest('[data-track="download_click"]');
    if (!target) return;
    if (!hasAnalyticsConsent()) return;

    const ref = localStorage.getItem(REF_KEY) || "direct";
    const store = target.dataset.store || "unknown";
    const { analytics, logEvent } = await getFirebaseHandles();
    logEvent(analytics, "download_click", { ...MARKET_PARAMS, ref, store, ...utmEventParams() });
  });
}

function init() {
  attachDownloadClickTracking();

  if (hasAnalyticsConsent()) {
    trackLandingPageRef();
  } else {
    onConsentAccepted(trackLandingPageRef);
  }
}

init();
