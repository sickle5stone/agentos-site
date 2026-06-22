/* agentOS marketing — gated download + mobile nav.
 *
 * SECURITY MODEL (read before changing):
 *   The ONLY real gate is the Cloudflare Worker. It holds the access-code hash
 *   and the private R2 object key as server secrets, validates the submitted
 *   code, and returns a short-lived signed URL. The binary's real URL never
 *   ships to the browser.
 *
 *   The client-side SHA-256 check below is a LOCAL-DEMO FALLBACK only. It is
 *   trivially bypassable (the hash is in this file) and must never be the sole
 *   gate in production. Set WORKER_URL and it takes over.
 *
 *   Worker source lives in the app repo at marketing/worker/. To go live:
 *   deploy it, upload the macOS build to its private R2 bucket, then set
 *   WORKER_URL below to "https://<worker>/download".
 */

// Point this at the deployed Worker (e.g. "https://dl.agentos.app/download").
// Empty string => local demo mode (client-side hash check, placeholder file).
const WORKER_URL = "";

// SHA-256("cleanmyagent") — demo fallback only. Real hash lives in the Worker secret.
const DEMO_CODE_HASH = "244c5ae872ff327c7b1aeea6d4deaa8d7318bafc5c5c46fe43e96f7efc9f41b4";

// Where the demo points when unlocked locally (no Worker). Replace per environment.
const DEMO_DOWNLOAD_URL = "https://github.com/sickle5stone/agentos-site";

const gate = document.getElementById("gate");
const form = document.getElementById("gate-form");
const input = document.getElementById("gate-input");
const err = document.getElementById("gate-err");
let lastFocused = null;

function openGate() {
  lastFocused = document.activeElement;
  gate.hidden = false;
  gate.classList.add("flex");
  err.textContent = "";
  input.value = "";
  // focus after paint so the transition doesn't eat it
  requestAnimationFrame(() => input.focus());
  document.addEventListener("keydown", onKey);
}

function closeGate() {
  gate.hidden = true;
  gate.classList.remove("flex");
  document.removeEventListener("keydown", onKey);
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

function onKey(e) {
  if (e.key === "Escape") closeGate();
}

async function sha256Hex(text) {
  if (!(crypto && crypto.subtle)) return null; // not a secure context
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verify(code) {
  // Production path: let the Worker decide and hand back the (signed) URL.
  if (WORKER_URL) {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, url: data.url || WORKER_URL };
    }
    return { ok: false };
  }

  // Local demo path: hash compare. Bypassable by design; never ship as the only gate.
  const hash = await sha256Hex(code.trim());
  if (hash === null) {
    return { ok: false, reason: "Run this over http(s) so the browser can hash the code, or deploy the Worker." };
  }
  return hash === DEMO_CODE_HASH ? { ok: true, url: DEMO_DOWNLOAD_URL } : { ok: false };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.textContent = "";
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Checking…";
  try {
    const result = await verify(input.value);
    if (result.ok) {
      btn.textContent = "Unlocked";
      // Hand off to the (signed) URL. Worker mode returns a real link; demo uses a placeholder.
      window.location.assign(result.url);
      setTimeout(closeGate, 600);
    } else {
      err.textContent = result.reason || "That code didn't match. Check it and try again.";
      input.focus();
      input.select();
    }
  } catch {
    err.textContent = "Could not reach the download service. Try again in a moment.";
  } finally {
    btn.disabled = false;
    if (btn.textContent === "Checking…") btn.textContent = "Unlock download";
  }
});

document.getElementById("gate-close").addEventListener("click", closeGate);
gate.addEventListener("click", (e) => {
  if (e.target === gate) closeGate(); // click the scrim, not the modal
});

document.querySelectorAll("[data-download]").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    closeMobileMenu();
    openGate();
  })
);

// Deep link: /#download opens the gate directly (shareable "get the build" link).
if (location.hash === "#download") openGate();
window.addEventListener("hashchange", () => {
  if (location.hash === "#download") openGate();
});

/* ── Mobile nav ──────────────────────────────────────────── */
const menuToggle = document.getElementById("menu-toggle");
const mobileMenu = document.getElementById("mobile-menu");

function closeMobileMenu() {
  if (!mobileMenu) return;
  mobileMenu.hidden = true;
  if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
}

if (menuToggle && mobileMenu) {
  menuToggle.addEventListener("click", () => {
    const open = mobileMenu.hidden;
    mobileMenu.hidden = !open;
    menuToggle.setAttribute("aria-expanded", String(open));
  });
  // Tapping any in-menu link (anchors) collapses the menu.
  mobileMenu.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => closeMobileMenu())
  );
}
