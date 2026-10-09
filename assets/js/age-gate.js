// Åldersspärr (över 25) för hela webbplatsen. Svaret sparas i localStorage
// (nödvändigt för att inte fråga på varje sida, kräver inget cookie-samtycke).
// "Nej" blockerar sidan, och blockeringen kvarstår vid nästa besök.
// Sökmotorer och förhandsgranskare får se sidan utan spärr.
const KEY = "elvina_age_gate";
export const AGE_CONFIRMED_EVENT = "elvina:age-confirmed";

const BOT =
  /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse/i;

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Utan lagring frågar vi bara igen nästa gång.
  }
}

function init() {
  const gate = document.getElementById("elvina-age-gate");
  if (!gate || BOT.test(navigator.userAgent)) return;
  const state = read();
  if (state === "confirmed") return;

  const ask = gate.querySelector("[data-age-ask]");
  const blocked = gate.querySelector("[data-age-blocked]");
  const show = (denied) => {
    ask.hidden = denied;
    blocked.hidden = !denied;
  };

  document.documentElement.classList.add("age-gate-open");
  gate.hidden = false;
  show(state === "denied");

  gate.querySelector("[data-age-yes]")?.addEventListener("click", () => {
    write("confirmed");
    gate.hidden = true;
    document.documentElement.classList.remove("age-gate-open");
    window.dispatchEvent(new CustomEvent(AGE_CONFIRMED_EVENT));
  });
  gate.querySelector("[data-age-no]")?.addEventListener("click", () => {
    write("denied");
    show(true);
  });
}

init();
