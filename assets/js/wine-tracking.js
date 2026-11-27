// Annonsmätning: hur ofta vinlistan i ett inlägg syns och hur ofta någon
// trycker på "Systembolaget →". Skickar anonyma räknehändelser (rätt, vin,
// position, kategori) till trackBlogWineEvent. Ingen cookie, inget ID och
// ingen localStorage skrivs — varje sidladdning räknas en gång.
import { hasAnalyticsConsent } from "./cookie-consent.js";

const ENDPOINT =
  "https://europe-west1-grapemate-f80e3.cloudfunctions.net/trackBlogWineEvent";

// Datan är anonym och lagrar inget på besökarens enhet. Sätt till true om
// mätningen ändå ska kräva godkända analys-cookies (siffrorna blir då lägre).
const REQUIRE_ANALYTICS_CONSENT = false;

function allowed() {
  return !REQUIRE_ANALYTICS_CONSENT || hasAnalyticsConsent();
}

function send(payload) {
  if (!allowed()) return;
  const body = JSON.stringify({ ...payload, hp: "" });
  try {
    // text/plain håller anropet "enkelt" (ingen CORS-preflight).
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        ENDPOINT,
        new Blob([body], { type: "text/plain" }),
      );
      if (ok) return;
    }
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Mätning får aldrig påverka sidan.
  }
}

function cardData(card) {
  return {
    productId: card.dataset.wineCode || "",
    name: card.dataset.wineName || "",
    position: Number(card.dataset.position) || 0,
    wineType: card.dataset.wineType || "",
    ...(card.dataset.sponsored === "true"
      ? { sponsored: true, placementId: card.dataset.placementId || "" }
      : {}),
  };
}

// En dish-guide har en lista; en pelarguide (julmat, nyår) kan ha en
// sponsrad lista per kursavsnitt. Varje lista räknas för sig.
function init() {
  document.querySelectorAll(".wine-live[data-dish]").forEach(initList);
}

function initList(list) {
  const dish = list.dataset.dish;
  if (!dish) return;
  const cards = [...list.querySelectorAll(".wine-live-card[data-wine-code]")];
  if (cards.length === 0) return;

  // Visning: listan är minst halvt synlig, en gång per sidladdning.
  let viewed = false;
  const reportView = () => {
    if (viewed) return;
    viewed = true;
    send({ event: "view", dishText: dish, results: cards.map(cardData) });
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          reportView();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(list);
  } else {
    reportView();
  }

  // Klick på länken till Systembolaget.
  list.addEventListener("click", (e) => {
    const link = e.target.closest?.("a.wine-live-pol");
    if (!link) return;
    const card = link.closest(".wine-live-card[data-wine-code]");
    if (!card) return;
    const result = cardData(card);
    send({ event: "external_click", dishText: dish, result });
    // GA4-händelse (kan importeras som sekundär konvertering i Google Ads).
    // gtag respekterar samtyckesläget från google-ads.js.
    window.gtag?.(
      "event",
      result.sponsored ? "elvina_sponsored_click" : "elvina_wine_click",
      {
        dish,
        product_id: result.productId,
        position: result.position,
        ...(result.sponsored ? { placement_id: result.placementId } : {}),
      },
    );
  });
}

// Räkna inte visningar medan åldersspärren täcker sidan.
if (document.documentElement.classList.contains("age-gate-open")) {
  window.addEventListener("elvina:age-confirmed", init, { once: true });
} else {
  init();
}
