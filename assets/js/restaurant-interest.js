// Interest form for restaurants. Messages come from data-* attributes on the
// form so the same file serves savino.no (nb) and elvina.se (sv).
const ENDPOINT =
  "https://europe-west1-grapemate-f80e3.cloudfunctions.net/submitRestaurantInterest";

const form = document.getElementById("rest-form");
if (form) {
  const status = form.querySelector(".status");
  const button = form.querySelector('button[type="submit"]');
  const t = form.dataset;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.className = "status";
    status.textContent = "";
    if (!form.reportValidity()) return;

    const f = new FormData(form);
    const body = {
      marketId: t.market,
      name: f.get("name"),
      restaurant: f.get("restaurant"),
      email: f.get("email"),
      phone: f.get("phone"),
      venues: f.get("venues"),
      message: f.get("message"),
      website: f.get("website"),
      consent: form.elements.consent.checked,
    };

    button.disabled = true;
    status.textContent = t.sending;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        form.reset();
        status.className = "status ok";
        status.textContent = t.success;
      } else if (res.status === 429) {
        status.className = "status error";
        status.textContent = t.rateLimited;
      } else {
        status.className = "status error";
        status.textContent = t.error;
      }
    } catch (_) {
      status.className = "status error";
      status.textContent = t.error;
    } finally {
      button.disabled = false;
    }
  });
}
