(() => {
  "use strict";
  const API = "https://lykos-estaff-service.lykosfutsalclub.workers.dev/api/estaff";
  const STORAGE_KEY = "lykos_performance_hub_tab_session_v2";
  const LEGACY_STORAGE_KEY = "lykos_performance_hub_session_v1";
  let session = null;
  let code = "";
  let busy = false;
  let gate = null;

  function readStoredSession() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (typeof value?.token === "string" && Number.isFinite(value?.expiresAt) && value.expiresAt * 1000 > Date.now()) return value;
    } catch {}
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }

  function emitSession(value) {
    window.dispatchEvent(new CustomEvent("lykos:hub-session", {detail:value || {token:"", expiresAt:0}}));
  }

  function unlock(value) {
    session = value;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    document.documentElement.classList.remove("lykos-access-locked");
    document.documentElement.classList.add("lykos-access-granted");
    gate?.remove();
    gate = null;
    emitSession(value);
  }

  function logout() {
    session = null;
    sessionStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  window.LYKOS_HUB_ACCESS = {
    getSession: () => session,
    logout,
  };

  async function validate(value) {
    const response = await fetch(`${API}/state`, {
      cache:"no-store",
      credentials:"omit",
      headers:{Authorization:`Bearer ${value.token}`},
      signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("session_invalid");
    return value;
  }

  function renderDots() {
    gate?.querySelectorAll(".lykos-access-dots span").forEach((dot, index) => dot.classList.toggle("is-filled", index < code.length));
    const submit = gate?.querySelector(".lykos-access-submit");
    if (submit) submit.disabled = busy || code.length !== 4;
  }

  function showMessage(message) {
    const target = gate?.querySelector(".lykos-access-message");
    if (target) target.textContent = message;
  }

  function addDigit(digit) {
    if (busy || code.length >= 4) return;
    code += digit;
    renderDots();
    if (code.length === 4) void submit();
  }

  function erase(all = false) {
    if (busy) return;
    code = all ? "" : code.slice(0, -1);
    showMessage("");
    renderDots();
  }

  async function submit() {
    if (busy || code.length !== 4) return;
    busy = true;
    gate?.querySelectorAll("button").forEach(button => {button.disabled = true;});
    showMessage("Vérification en cours…");
    try {
      const response = await fetch(`${API}/session`, {
        method:"POST",
        cache:"no-store",
        credentials:"omit",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({code}),
        signal:AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        showMessage(response.status === 401 ? "Code incorrect." : response.status === 429 ? "Trop de tentatives. Réessayez dans quelques minutes." : "Accès momentanément indisponible.");
        code = "";
        return;
      }
      const value = await response.json();
      if (typeof value.token !== "string" || !Number.isFinite(value.expiresAt)) throw new Error("session_invalid");
      await validate(value);
      unlock(value);
    } catch {
      showMessage("Connexion impossible pour le moment. Réessayez.");
      code = "";
    } finally {
      busy = false;
      gate?.querySelectorAll("button").forEach(button => {button.disabled = false;});
      renderDots();
    }
  }

  function mount(waiting = false) {
    document.documentElement.classList.add("lykos-access-locked");
    gate = document.createElement("section");
    gate.className = `lykos-access-gate${waiting ? " lykos-access-waiting" : ""}`;
    gate.setAttribute("aria-label", "Accès au Performance Hub");
    gate.innerHTML = `<div class="lykos-access-card">
      <div class="lykos-access-brand"><img src="/performance-hub/logo-lykos-intro-carre-2026.png" alt="Logo Lykos Futsal Club"><div><strong>PERFORMANCE HUB</strong><span>LYKOS FUTSAL CLUB</span></div></div>
      <h1>Bienvenue.</h1>
      <p class="lykos-access-intro">Composez le code du club pour ouvrir le Performance Hub et l’ensemble de ses espaces.</p>
      <div class="lykos-access-dots" aria-label="Code à quatre chiffres"><span></span><span></span><span></span><span></span></div>
      <div class="lykos-access-keypad" aria-label="Clavier numérique"></div>
      <button class="lykos-access-submit" type="button" disabled>Ouvrir le Performance Hub</button>
      <p class="lykos-access-message" role="status">${waiting ? "Vérification de votre accès…" : ""}</p>
    </div>`;
    const keypad = gate.querySelector(".lykos-access-keypad");
    ["1","2","3","4","5","6","7","8","9","C","0","⌫"].forEach(value => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = value;
      button.setAttribute("aria-label", value === "C" ? "Effacer le code" : value === "⌫" ? "Effacer le dernier chiffre" : `Chiffre ${value}`);
      button.addEventListener("click", () => value === "C" ? erase(true) : value === "⌫" ? erase() : addDigit(value));
      keypad.append(button);
    });
    gate.querySelector(".lykos-access-submit").addEventListener("click", () => void submit());
    document.body.append(gate);
    document.addEventListener("keydown", event => {
      if (!gate || busy || event.altKey || event.ctrlKey || event.metaKey) return;
      if (/^[0-9]$/.test(event.key)) {event.preventDefault(); addDigit(event.key);}
      else if (event.key === "Backspace") {event.preventDefault(); erase();}
      else if (event.key === "Escape") {event.preventDefault(); erase(true);}
      else if (event.key === "Enter") {event.preventDefault(); void submit();}
    });
  }

  async function start() {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    const stored = readStoredSession();
    mount(Boolean(stored));
    if (!stored) return;
    try {
      await validate(stored);
      unlock(stored);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      gate?.classList.remove("lykos-access-waiting");
      showMessage("Votre accès a expiré. Composez à nouveau le code.");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void start(), {once:true});
  else void start();
})();
