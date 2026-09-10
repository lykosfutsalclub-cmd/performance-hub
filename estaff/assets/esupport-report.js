(() => {
  const API = "https://performance-hub-lykos-fc.fab-mysterio.chatgpt.site/api/estaff";
  const originalFetch = window.fetch.bind(window);
  let sessionToken = "";
  let latestReport = null;
  let scheduled = false;
  let selectedService = "";
  const femaleAgents = new Set(["Sophie", "Véronique", "Patricia", "Alice", "Sandrine"]);
  const serviceLabels = {coordination:"eChief", operations:"eOpérations", sport:"eSportif", data:"eDatas", academy:"eAcademie", support:"eSupport"};
  const esupportRoles = {
    Oscar: {
      title:"Supervision et validation finale",
      summary:"Superviser la chaîne eSupport et confirmer son verdict final.",
      purpose:"Oscar rassemble les constats de Patricia, le diagnostic de Gaston et la validation de Véronique. Il confirme le fonctionnement uniquement lorsque toute la chaîne est au vert.",
      when:"À la fin de chaque contrôle eSupport et lors des rapports du lundi et du jeudi.",
      output:"Une conclusion claire : service confirmé, à surveiller ou bloqué, avec la raison.",
    },
    Patricia: {
      title:"Surveillance SportEasy",
      summary:"Surveiller SportEasy et détecter les données manquantes.",
      purpose:"Patricia contrôle la disponibilité des routes SportEasy, l’authentification, la fraîcheur des données publiques et la présence du dernier match réellement finalisé.",
      when:"Chaque nuit, après une mise en ligne et lors des rapports du lundi et du jeudi.",
      output:"Un relevé précis des contrôles réussis et des anomalies transmis à Gaston.",
    },
    Gaston: {
      title:"Diagnostic et correction technique",
      summary:"Diagnostiquer les anomalies et préparer leur correction technique.",
      purpose:"Gaston reçoit les anomalies détectées par Patricia, en recherche la cause et prépare une correction sans modifier Metron ni écrire dans SportEasy.",
      when:"Dès qu’un contrôle de Patricia échoue ou qu’une route SportEasy change.",
      output:"Un diagnostic reproductible, une correction vérifiée ou la confirmation qu’aucun correctif n’est nécessaire.",
    },
    Véronique: {
      title:"Contrôle et mise en ligne",
      summary:"Contrôler la correction, autoriser la mise en ligne et confirmer le résultat.",
      purpose:"Véronique vérifie les contrôles et les corrections de Gaston. Elle prononce un GO ou un NO-GO avant qu’Oscar ne rende sa conclusion finale.",
      when:"Après chaque diagnostic ou mise en ligne et pendant chaque cycle eSupport.",
      output:"Un verdict qualité explicite et la confirmation de la version publique lorsqu’elle est conforme.",
    },
    Giannis: {
      title:"Analyse des données et de Metron",
      summary:"Analyser les données du Hub et expliquer Metron sans en modifier les règles.",
      purpose:"Giannis transforme les données actuelles et historiques en constats simples. Il cite toujours la période, la taille de l’échantillon, la fiabilité des données et la version de Metron utilisée.",
      when:"Après une synchronisation post-match, puis chaque mois pour les synthèses prévues par le Rulebook.",
      output:"Des faits, calculs et interprétations séparés, avec une limite explicite lorsque les données ne suffisent pas.",
    },
  };

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
    for (const button of document.querySelectorAll('button[aria-pressed]')) {
      const name = button.querySelector("strong")?.textContent?.trim();
      const role = esupportRoles[name];
      const title = button.querySelector("strong")?.nextElementSibling;
      if (role && title?.tagName === "SMALL") title.textContent = role.title;
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
      const role = esupportRoles[agent];
      if (role) {
        const summary = roleDisclosure.querySelector("summary");
        const summaryText = summary?.querySelector(".roleSummary") || summary?.querySelector("strong")?.nextElementSibling;
        const purpose = roleDisclosure.querySelector(":scope > p");
        const details = roleDisclosure.querySelectorAll("dd");
        if (summaryText) summaryText.textContent = role.summary;
        if (purpose) purpose.textContent = role.purpose;
        if (details[0]) details[0].textContent = role.when;
        if (details[1]) details[1].textContent = role.output;
      }
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
    for (const version of document.querySelectorAll("small")) {
      if (/^Rulebook \d+\.\d+\.\d+$/.test(version.textContent.trim())) version.textContent = "Rulebook 2.4.0";
    }

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
