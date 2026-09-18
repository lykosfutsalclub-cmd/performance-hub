(() => {
  "use strict";
  const SERVICE = "https://performance-hub-lykos-fc.fab-mysterio.chatgpt.site/api/estaff";
  const originalFetch = window.fetch.bind(window);
  let accessToken = "";
  let syncing = false;

  function captureToken(request) {
    if (!request.url.startsWith(SERVICE)) return;
    const authorization = request.headers.get("Authorization") || "";
    if (authorization.startsWith("Bearer ")) accessToken = authorization.slice(7);
  }

  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    captureToken(request);
    const response = await originalFetch(input, init);
    if (accessToken) void refreshButton();
    return response;
  };

  function isIos() {return /iphone|ipad|ipod/i.test(navigator.userAgent);}
  function isStandalone() {return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;}
  function supported() {return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;}
  function decodeKey(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }
  function api(path, init = {}) {
    return originalFetch(`${SERVICE}${path}`, {...init, cache:"no-store", headers:{...init.headers, Authorization:`Bearer ${accessToken}`}});
  }

  async function sendSubscription(subscription, active) {
    const response = await api("/push/subscription", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({subscription:subscription.toJSON(), active, userAgent:navigator.userAgent}),
    });
    if (!response.ok) throw new Error("subscription");
    return response.json();
  }

  function renderButton(button, state) {
    button.disabled = ["busy", "blocked", "unsupported"].includes(state);
    button.dataset.state = state;
    button.textContent = state === "active" ? "🔔 Notifications activées · désactiver"
      : state === "busy" ? "Activation…"
      : state === "blocked" ? "Notifications refusées par le téléphone"
      : state === "install" ? "🔔 Installer pour être notifié"
      : state === "unsupported" ? "Notifications indisponibles"
      : state === "error" ? "Réessayer les notifications"
      : "🔔 Activer les notifications";
  }

  async function toggleNotifications(button) {
    if (isIos() && !isStandalone()) {
      alert("Sur iPhone : touchez Partager, puis « Sur l’écran d’accueil ». Ouvrez ensuite eStaff depuis cette nouvelle icône et activez les notifications.");
      return;
    }
    if (!accessToken) {
      alert("Ouvrez d’abord eStaff avec votre code, puis activez les notifications.");
      return;
    }
    renderButton(button, "busy");
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing && button.dataset.previousState === "active") {
        await sendSubscription(existing, false);
        await existing.unsubscribe();
        button.dataset.previousState = "ready";
        renderButton(button, "ready");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("permission");
      const keyResponse = await api("/push/key");
      if (!keyResponse.ok) throw new Error("configuration");
      const {publicKey} = await keyResponse.json();
      const subscription = existing || await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:decodeKey(publicKey)});
      await sendSubscription(subscription, true);
      button.dataset.previousState = "active";
      renderButton(button, "active");
    } catch {
      const state = Notification.permission === "denied" ? "blocked" : "error";
      button.dataset.previousState = state;
      renderButton(button, state);
    }
  }

  async function refreshButton() {
    const button = document.querySelector(".estaff-notify-button");
    if (!button || syncing) return;
    syncing = true;
    try {
      if (!supported()) return renderButton(button, "unsupported");
      if (isIos() && !isStandalone()) return renderButton(button, "install");
      if (Notification.permission === "denied") return renderButton(button, "blocked");
      const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      const state = subscription ? "active" : "ready";
      button.dataset.previousState = state;
      renderButton(button, state);
    } finally {syncing = false;}
  }

  function installButton() {
    const bar = document.querySelector('section[aria-label="Fonctionnement d’Oscar"]');
    if (!bar || bar.querySelector(".estaff-notify-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "estaff-notify-button";
    button.addEventListener("click", () => toggleNotifications(button));
    bar.append(button);
    void refreshButton();
  }

  if (supported()) navigator.serviceWorker.register("./sw.js", {scope:"./"}).catch(() => {});
  new MutationObserver(installButton).observe(document.documentElement, {childList:true, subtree:true});
  installButton();
})();
