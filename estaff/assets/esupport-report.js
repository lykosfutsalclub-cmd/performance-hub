(() => {
  const API = "https://performance-hub-lykos-fc.fab-mysterio.chatgpt.site/api/estaff";
  const originalFetch = window.fetch.bind(window);
  let sessionToken = "";
  let latestReport = null;
  let scheduled = false;

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "heure indisponible" : date.toLocaleString("fr-FR", {dateStyle:"medium", timeStyle:"short"});
  }

  function selectedConversation() {
    return [...document.querySelectorAll("section[aria-label]")].find(node => node.getAttribute("aria-label")?.startsWith("Espace de ")) || null;
  }

  function enforceReadOnlyMode() {
    scheduled = false;
    const conversation = selectedConversation();
    if (!conversation) return;
    const agent = conversation.getAttribute("aria-label").replace("Espace de ", "");
    const textarea = conversation.querySelector('textarea[aria-label^="Message à "]');
    const composer = textarea?.closest("form") || textarea?.parentElement;
    if (composer) composer.hidden = true;
    if (composer?.nextElementSibling) composer.nextElementSibling.hidden = true;

    const tabs = conversation.querySelector('nav[aria-label="Contenu de l’agent"]');
    const tabButtons = tabs?.querySelectorAll("button") || [];
    if (tabButtons[0] && tabButtons[0].textContent !== "💬 Fil de l’agent") tabButtons[0].textContent = "💬 Fil de l’agent";
    if (tabButtons[1]) tabButtons[1].hidden = true;

    let notice = conversation.querySelector(".lykos-oneway-notice");
    const messages = conversation.querySelector('[aria-live="polite"]');
    if (messages && !notice) {
      notice = document.createElement("p");
      notice.className = "lykos-oneway-notice";
      messages.before(notice);
    }
    if (notice) notice.textContent = `Lecture seule · seul ${agent} publie ses récapitulatifs dans ce fil.`;

    const emptyTitle = [...(messages?.querySelectorAll("h3") || [])].find(node => node.textContent.includes("est prêt"));
    if (emptyTitle) {
      emptyTitle.textContent = "Aucun autre récapitulatif pour le moment";
      if (emptyTitle.nextElementSibling) emptyTitle.nextElementSibling.textContent = `${agent} publiera ici ses prochains travaux et ce qu’il prévoit de faire.`;
    }

    const activity = document.querySelector('section[aria-label="Activité"] p');
    if (activity && activity.textContent !== "Rapports automatiques · lecture seule") activity.textContent = "Rapports automatiques · lecture seule";
    const footerStatus = [...document.querySelectorAll("footer span")].find(node => node.textContent.includes("moteur local"));
    if (footerStatus) footerStatus.textContent = "Récapitulatifs automatiques · lecture seule";

    let card = document.getElementById("lykos-esupport-report");
    if (agent !== "Oscar" || !latestReport || !messages) { card?.remove(); return; }
    if (!card) {
      card = document.createElement("article");
      card.id = "lykos-esupport-report";
      card.setAttribute("aria-label", "Récapitulatif automatique d’Oscar");
      card.innerHTML = `<small>OSCAR · RÉCAPITULATIF eSUPPORT</small><strong></strong><p></p><time></time>`;
      messages.prepend(card);
    }
    const className = `lykos-esupport-report is-${latestReport.status || "pending"}`;
    const title = latestReport.status === "operational" ? "Tout est opérationnel" : latestReport.status === "blocked" ? "Intervention nécessaire" : "Point à surveiller";
    const summary = latestReport.summary || "Le premier contrôle automatique est en attente.";
    const publishedAt = `Publié automatiquement le ${formatDate(latestReport.checkedAt)}`;
    if (card.className !== className) card.className = className;
    if (card.querySelector("strong").textContent !== title) card.querySelector("strong").textContent = title;
    if (card.querySelector("p").textContent !== summary) card.querySelector("p").textContent = summary;
    if (card.querySelector("time").textContent !== publishedAt) card.querySelector("time").textContent = publishedAt;
  }

  function scheduleReadOnlyMode() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enforceReadOnlyMode);
  }

  async function loadReport(token) {
    sessionToken = token;
    try {
      const response = await originalFetch(`${API}/esupport`, {cache:"no-store", credentials:"omit", headers:{Authorization:`Bearer ${token}`}});
      if (response.status === 401) { sessionToken = ""; latestReport = null; scheduleReadOnlyMode(); return; }
      if (!response.ok) throw new Error("report_unavailable");
      latestReport = await response.json();
    } catch {
      latestReport = {status:"pending", summary:"Le rapport automatique eSupport est momentanément indisponible."};
    }
    scheduleReadOnlyMode();
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (url === `${API}/session` && response.ok) {
      response.clone().json().then(payload => {
        if (typeof payload.token === "string") loadReport(payload.token);
      }).catch(() => {});
    }
    return response;
  };

  new MutationObserver(() => {
    if (sessionToken && document.body.textContent.includes("Code d’accès")) {
      sessionToken = "";
      latestReport = null;
    }
    scheduleReadOnlyMode();
  }).observe(document.documentElement, {childList:true, subtree:true});
})();
