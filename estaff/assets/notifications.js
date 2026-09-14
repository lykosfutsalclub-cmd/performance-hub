(() => {
  "use strict";
  const SERVICE = "https://performance-hub-lykos-fc.fab-mysterio.chatgpt.site/api/estaff";
  const originalFetch = window.fetch.bind(window);
  let accessToken = "";
  let missionStartedAt = 0;
  let estimatedSeconds = 90;
  let progressTimer = 0;

  function captureToken(request) {
    if (!request.url.startsWith(SERVICE)) return;
    const authorization = request.headers.get("Authorization") || "";
    if (authorization.startsWith("Bearer ")) accessToken = authorization.slice(7);
  }

  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    captureToken(request);
    const response = await originalFetch(input, init);
    if (request.url === `${SERVICE}/jobs` && request.method === "POST" && response.ok) {
      missionStartedAt = Date.now();
      response.clone().json().then(data => {estimatedSeconds = Number(data.estimatedSeconds) || 90; updateProgress();}).catch(() => {});
      startProgress();
    }
    if (/\/jobs\/[a-f0-9-]{36}$/.test(request.url) && response.status === 200) stopProgress();
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

  async function saveSubscription(subscription) {
    const response = await api("/push/subscription", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({subscription:subscription.toJSON()})});
    if (!response.ok) throw new Error("subscription");
    localStorage.setItem("lykos-estaff-notifications", "active");
  }

  async function enableNotifications(button) {
    if (isIos() && !isStandalone()) {
      alert("Sur iPhone : touchez Partager, puis « Sur l’écran d’accueil ». Ouvrez ensuite eStaff depuis sa nouvelle icône et touchez de nouveau ce bouton.");
      return;
    }
    button.disabled = true;
    button.textContent = "Activation…";
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("permission");
      const registration = await navigator.serviceWorker.ready;
      const keyResponse = await api("/push/key");
      if (!keyResponse.ok) throw new Error("configuration");
      const {publicKey} = await keyResponse.json();
      const subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:decodeKey(publicKey)});
      await saveSubscription(subscription);
      renderButton(button, "active");
    } catch {
      renderButton(button, Notification.permission === "denied" ? "blocked" : "error");
    }
  }

  function renderButton(button, state) {
    button.disabled = state === "active" || state === "blocked";
    button.dataset.state = state;
    button.textContent = state === "active" ? "🔔 Notifications activées"
      : state === "blocked" ? "Notifications refusées par le téléphone"
      : state === "install" ? "🔔 Installer pour être notifié"
      : state === "unsupported" ? "Notifications indisponibles"
      : "🔔 Activer les notifications";
  }

  async function syncExisting(button) {
    if (!supported()) return renderButton(button, "unsupported");
    if (isIos() && !isStandalone()) return renderButton(button, "install");
    if (Notification.permission === "denied") return renderButton(button, "blocked");
    if (Notification.permission !== "granted" || !accessToken) return renderButton(button, "ready");
    try {
      const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (!subscription) return renderButton(button, "ready");
      await saveSubscription(subscription);
      renderButton(button, "active");
    } catch {renderButton(button, "ready");}
  }

  function installButton() {
    const bar = document.querySelector('section[aria-label="Fonctionnement d’Oscar"]');
    if (!bar || bar.querySelector(".estaff-notify-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "estaff-notify-button";
    button.addEventListener("click", () => enableNotifications(button));
    bar.append(button);
    syncExisting(button);
  }

  function progressText(seconds) {
    if (seconds < 15) return "Mission reçue · Oscar précise l’objectif.";
    if (seconds < 60) return "Oscar mobilise uniquement les spécialistes nécessaires.";
    if (seconds < estimatedSeconds) return estimatedSeconds > 180 ? "Rapport exhaustif en cours · objectif environ 6 minutes." : "Retours en cours · objectif environ 90 secondes.";
    return "Synthèse approfondie en cours · vous pouvez fermer l’app si les notifications sont activées.";
  }
  function updateProgress() {
    if (!missionStartedAt) return;
    const thinking = [...document.querySelectorAll("article")].find(article => article.textContent.includes("Je qualifie la mission"));
    if (!thinking) return;
    let status = thinking.querySelector(".estaff-mission-progress");
    if (!status) {status = document.createElement("small"); status.className = "estaff-mission-progress"; thinking.append(status);}
    status.textContent = `${progressText(Math.floor((Date.now() - missionStartedAt) / 1000))} · ${Math.floor((Date.now() - missionStartedAt) / 60000)} min ${Math.floor((Date.now() - missionStartedAt) / 1000) % 60} s`;
  }
  function startProgress() {window.clearInterval(progressTimer); updateProgress(); progressTimer = window.setInterval(updateProgress, 5000);}
  function stopProgress() {window.clearInterval(progressTimer); progressTimer = 0; missionStartedAt = 0;}

  if (supported()) navigator.serviceWorker.register("./sw.js", {scope:"./"}).catch(() => {});
  new MutationObserver(() => {installButton(); updateProgress();}).observe(document.documentElement, {childList:true, subtree:true});
  installButton();
})();
