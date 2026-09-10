(() => {
  const API = "https://performance-hub-lykos-fc.fab-mysterio.chatgpt.site/api/estaff";
  const originalFetch = window.fetch.bind(window);
  let sessionToken = "";
  let latestReport = null;
  let scheduled = false;
  let selectedService = "";
  const femaleAgents = new Set(["Sophie", "Véronique", "Patricia", "Alice", "Sandrine"]);
  const serviceLabels = {coordination:"eChief", operations:"eOpérations", sport:"eSportif", data:"eDatas", academy:"eAcademie", support:"eSupport"};

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "heure indisponible" : date.toLocaleString("fr-FR", {dateStyle:"medium", timeStyle:"short"});
  }

  function selectedConversation() {
    return [...document.querySelectorAll("section[aria-label]")].find(node => node.getAttribute("aria-label")?.startsWith("Espace de ")) || null;
  }

  function reportEntries() {
    if (Array.isArray(latestReport?.history)) return latestReport.history;
    if (Array.isArray(latestReport?.feed)) return [...latestReport.feed].reverse();
    if (!latestReport?.summary) return [];
    return [{
      missionId:"esupport-legacy", sequence:4, agent:"Oscar", type:"supervision",
      status:latestReport.status === "operational" ? "confirme" : "attention",
      title:latestReport.status === "operational" ? "Service confirmé opérationnel" : "Service non confirmé",
      summary:latestReport.summary, occurredAt:latestReport.checkedAt, service:"eSupport",
    }];
  }

  function reportCard(entry) {
    const card = document.createElement("article");
    card.className = `lykos-agent-report is-${String(entry.status || "attention").replace(/[^a-z-]/g, "")}`;
    const label = document.createElement("small");
    label.textContent = `${entry.agent.toLocaleUpperCase("fr")} · ${String(entry.type || "récapitulatif").toLocaleUpperCase("fr")}`;
    const title = document.createElement("strong");
    title.textContent = entry.title || "Récapitulatif eSupport";
    const summary = document.createElement("p");
    summary.textContent = entry.summary || "Aucun détail supplémentaire.";
    const time = document.createElement("time");
    time.textContent = formatDate(entry.occurredAt);
    card.append(label, title, summary, time);
    return card;
  }

  function renderCards(container, entries, signature) {
    if (container.dataset.signature === signature) return;
    container.replaceChildren(...entries.map(reportCard));
    container.dataset.signature = signature;
  }

  function installServiceButtons() {
    for (const heading of document.querySelectorAll("h3[data-service]")) {
      const service = heading.dataset.service;
      if (!serviceLabels[service] || heading.querySelector(".lykos-service-button")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lykos-service-button";
      button.textContent = serviceLabels[service];
      button.setAttribute("aria-label", `Voir le fil global ${serviceLabels[service]}`);
      button.addEventListener("click", () => {selectedService = service; scheduleReadOnlyMode();});
      heading.replaceChildren(button);
    }
  }

  function enforceReadOnlyMode() {
    scheduled = false;
    const conversation = selectedConversation();
    if (!conversation) return;
    installServiceButtons();
    const agent = conversation.getAttribute("aria-label").replace("Espace de ", "");
    const textarea = conversation.querySelector('textarea[aria-label^="Message à "]');
    const composer = textarea?.closest("form") || textarea?.parentElement;
    if (composer) composer.hidden = true;
    if (composer?.nextElementSibling) composer.nextElementSibling.hidden = true;

    const chatHeader = conversation.querySelector("header");
    const tabs = conversation.querySelector('nav[aria-label="Contenu de l’agent"]');
    const tabButtons = tabs?.querySelectorAll("button") || [];
    if (tabButtons[0] && tabButtons[0].textContent !== "💬 Fil de l’agent") tabButtons[0].textContent = "💬 Fil de l’agent";
    if (tabButtons[1]) tabButtons[1].hidden = true;

    const messages = conversation.querySelector('[aria-live="polite"]');
    conversation.querySelector(".lykos-oneway-notice")?.remove();

    const roleSource = messages?.querySelector("details");
    let roleDisclosure = conversation.querySelector("details.lykos-agent-purpose");
    if (roleSource && tabs) {
      roleSource.hidden = true;
      if (!roleDisclosure || roleDisclosure.dataset.agent !== agent) {
        roleDisclosure?.remove();
        roleDisclosure = roleSource.cloneNode(true);
        roleDisclosure.hidden = false;
        roleDisclosure.classList.add("lykos-agent-purpose");
        roleDisclosure.dataset.agent = agent;
        tabs.before(roleDisclosure);
      }
    }
    if (roleDisclosure) {

      const roleLabels = roleDisclosure.querySelectorAll("dt");
      const isFemale = femaleAgents.has(agent);
      if (roleLabels[0]) roleLabels[0].textContent = isFemale ? "Quand la solliciter" : "Quand le solliciter";
      if (roleLabels[1]) roleLabels[1].textContent = isFemale ? "Ce qu’elle prépare" : "Ce qu’il prépare";
      const roleFooter = roleDisclosure.querySelector("footer");
      if (roleFooter) roleFooter.textContent = `${isFemale ? "Agente installée" : "Agent installé"} dans le moteur privé OpenClaw du club. Ses outils restent cloisonnés selon sa mission.`;
    }

    let serviceFeed = conversation.querySelector(".lykos-service-feed");
    const serviceMode = Boolean(selectedService);
    if (serviceMode && tabs) {
      if (!serviceFeed) {
        serviceFeed = document.createElement("section");
        serviceFeed.className = "lykos-service-feed";
        tabs.before(serviceFeed);
      }
      const serviceName = serviceLabels[selectedService];
      const entries = reportEntries().filter(entry => entry.service === serviceName);
      const signature = `${serviceName}:${entries.map(entry => `${entry.missionId}-${entry.sequence}-${entry.status}`).join("|")}`;
      if (serviceFeed.dataset.signature !== signature) {
        const header = document.createElement("header");
        const heading = document.createElement("h2");
        heading.textContent = `Fil global ${serviceName}`;
        const description = document.createElement("p");
        description.textContent = entries.length
          ? "Tous les contrôles, diagnostics, validations et conclusions du service, du plus récent au plus ancien."
          : "Aucun récapitulatif publié par ce service pour le moment.";
        header.append(heading, description);
        const list = document.createElement("div");
        list.className = "lykos-service-feed-list";
        renderCards(list, entries, signature);
        serviceFeed.replaceChildren(header, list);
        serviceFeed.dataset.signature = signature;
      }
    }
    if (serviceFeed) serviceFeed.hidden = !serviceMode;
    if (chatHeader) chatHeader.hidden = serviceMode;
    if (roleDisclosure) roleDisclosure.hidden = serviceMode;
    if (tabs) tabs.hidden = serviceMode;
    if (messages) messages.hidden = serviceMode;

    const agentStatus = conversation.querySelector("header > span:last-child");
    if (agentStatus && /^(Prêt|Prête|Installé|Installée)$/.test(agentStatus.textContent)) {
      const isReady = agentStatus.textContent.startsWith("Prêt");
      agentStatus.textContent = femaleAgents.has(agent)
        ? (isReady ? "Prête" : "Installée")
        : (isReady ? "Prêt" : "Installé");
    }

    const emptyTitle = [...(messages?.querySelectorAll("h3") || [])].find(node => node.textContent.includes("est prêt"));
    if (emptyTitle) {
      emptyTitle.textContent = "Aucun autre récapitulatif pour le moment";
      if (emptyTitle.nextElementSibling) emptyTitle.nextElementSibling.textContent = femaleAgents.has(agent)
        ? `${agent} publiera ici ses prochains travaux et ce qu’elle prévoit de faire.`
        : `${agent} publiera ici ses prochains travaux et ce qu’il prévoit de faire.`;
    }

    const activity = document.querySelector('section[aria-label="Activité"] p');
    if (activity && activity.textContent !== "Rapports automatiques · lecture seule") activity.textContent = "Rapports automatiques · lecture seule";
    const footerStatus = [...document.querySelectorAll("footer span")].find(node => node.textContent.includes("moteur local"));
    if (footerStatus) footerStatus.textContent = "Récapitulatifs automatiques · lecture seule";

    document.getElementById("lykos-esupport-report")?.remove();
    if (!messages) return;
    const entries = reportEntries().filter(entry => entry.agent === agent);
    let agentReports = messages.querySelector(".lykos-agent-reports");
    if (entries.length) {
      if (!agentReports) {
        agentReports = document.createElement("div");
        agentReports.className = "lykos-agent-reports";
        messages.prepend(agentReports);
      }
      renderCards(agentReports, entries, entries.map(entry => `${entry.missionId}-${entry.sequence}-${entry.status}`).join("|"));
    } else {
      agentReports?.remove();
    }
    const emptyState = [...messages.querySelectorAll("h3")].find(node => node.textContent.includes("Aucun autre récapitulatif"))?.parentElement;
    if (emptyState) emptyState.hidden = entries.length > 0;
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

  document.addEventListener("click", event => {
    const button = event.target.closest?.("button[aria-pressed]");
    const conversation = selectedConversation();
    if (selectedService && button && !conversation?.contains(button)) {
      selectedService = "";
      scheduleReadOnlyMode();
    }
  });

  new MutationObserver(() => {
    if (sessionToken && document.body.textContent.includes("Code d’accès")) {
      sessionToken = "";
      latestReport = null;
    }
    scheduleReadOnlyMode();
  }).observe(document.documentElement, {childList:true, subtree:true});
})();
