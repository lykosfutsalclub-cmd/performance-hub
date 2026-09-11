(() => {
  const API = "https://performance-hub-lykos-fc.fab-mysterio.chatgpt.site/api/estaff";
  const originalFetch = window.fetch.bind(window);
  let sessionToken = "";
  let latestReport = null;
  let latestReturns = [];
  let scheduled = false;
  let selectedService = "";
  let selectedAgent = "";
  let agentFeedOpen = false;
  const manuallyCollapsedAgentFeeds = new Set();
  const COLLAPSE_THRESHOLD = 420;
  const femaleAgents = new Set(["Sophie", "Véronique", "Patricia", "Alice", "Sandrine"]);
  const serviceLabels = {coordination:"eChief", operations:"eOpérations", sport:"eSportif", data:"eDatas", academy:"eAcademie", support:"eSupport", brand:"eBrand"};
  const esupportRoles = {
    Nadir: {
      title:"Analyse tactique vidéo",
      summary:"Relier les images au style de jeu demandé par les coachs.",
      purpose:"Nadir observe les situations visibles, les confronte aux principes demandés par les coachs et en tire des points forts, des axes d’amélioration et des priorités concrètes pour l’entraînement et le prochain match. Il ne produit plus de statistiques vidéo.",
      when:"Après chaque vidéo de match suffisamment exploitable pour une lecture tactique.",
      output:"Une analyse critique horodatée : 3 ou 4 points forts, 3 ou 4 axes d’amélioration et les prochains focus terrain.",
    },
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
      summary:"Interpréter les données du Hub et transmettre ses rapports à Sandrine.",
      purpose:"Giannis transforme les données disponibles en rapports sportifs contextualisés. Il ne cherche pas prioritairement à établir des Top 3 ou 5 : il explique ce que montrent les données, leurs limites et la version de Metron utilisée.",
      when:"Après une synchronisation, dès qu’une période comporte au moins deux matchs.",
      output:"Un rapport séparant faits, calculs, interprétation et limites, puis transmis automatiquement à Sandrine.",
    },
    Sandrine: {
      title:"Amélioration du Performance Hub",
      summary:"Remettre en question le Hub à partir des rapports de Giannis.",
      purpose:"Sandrine reçoit les rapports de Giannis, cherche ce que le Performance Hub explique mal ou ne mesure pas encore, puis prépare des idées d’amélioration utiles et réalisables.",
      when:"Après chaque nouveau rapport de Giannis et lors de ses audits ciblés du Hub.",
      output:"Des propositions priorisées qui apportent une compréhension sportive nouvelle, sans modifier elle-même Metron ni le site.",
    },
    Konstantinos: {
      title:"Marque, contenus et partenariats",
      summary:"Développer eBrand en restant fidèle à l’identité du Lykos FC.",
      purpose:"Konstantinos analyse l’image du club, la cohérence des contenus, les opportunités de partenariat et les idées de produits. Il transforme ses observations en recommandations concrètes pour Oscar et les dirigeants.",
      when:"Pour préparer une campagne, évaluer un contenu, cadrer un partenariat ou étudier un produit aux couleurs du club.",
      output:"Un Brand Opportunity Brief : constat, public visé, proposition, bénéfices, risques, effort estimé et prochaine décision attendue.",
    },
  };

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "heure indisponible" : date.toLocaleString("fr-FR", {dateStyle:"medium", timeStyle:"short"});
  }

  function makeCollapsibleParagraph(text, className = "") {
    const paragraph = document.createElement("p");
    if (className) paragraph.className = className;
    const normalized = String(text || "").trim();
    if (normalized.length <= COLLAPSE_THRESHOLD) {
      paragraph.textContent = normalized;
      return paragraph;
    }
    paragraph.classList.add("lykos-collapsible-notification");
    paragraph.dataset.lykosCollapsible = "true";
    const preview = document.createElement("span");
    preview.className = "lykos-notification-preview";
    preview.textContent = `${normalized.slice(0, COLLAPSE_THRESHOLD).trimEnd()}…`;
    const full = document.createElement("span");
    full.className = "lykos-notification-full";
    full.textContent = normalized;
    full.hidden = true;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "lykos-notification-toggle";
    toggle.textContent = "… Lire la suite";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      preview.hidden = !expanded;
      full.hidden = expanded;
      toggle.textContent = expanded ? "… Lire la suite" : "Réduire";
    });
    paragraph.append(preview, full, toggle);
    return paragraph;
  }

  function collapseLongExistingNotifications(container) {
    for (const paragraph of container?.querySelectorAll(":scope > div > p") || []) {
      if (paragraph.dataset.lykosCollapsible === "true" || paragraph.textContent.trim().length <= COLLAPSE_THRESHOLD) continue;
      paragraph.replaceWith(makeCollapsibleParagraph(paragraph.textContent, paragraph.className));
    }
  }

  function selectedConversation() {
    return [...document.querySelectorAll("section[aria-label]")].find(node => node.getAttribute("aria-label")?.startsWith("Espace de ")) || null;
  }

  function reportEntries() {
    let esupportEntries = [];
    if (Array.isArray(latestReport?.history)) esupportEntries = latestReport.history;
    else if (Array.isArray(latestReport?.feed)) esupportEntries = [...latestReport.feed].reverse();
    else if (latestReport?.summary) esupportEntries = [{
      missionId:"esupport-legacy", sequence:4, agent:"Oscar", type:"supervision",
      status:latestReport.status === "operational" ? "confirme" : "attention",
      title:latestReport.status === "operational" ? "Service confirmé opérationnel" : "Service non confirmé",
      summary:latestReport.summary, occurredAt:latestReport.checkedAt, service:"eSupport",
    }];
    return [...latestReturns, ...esupportEntries]
      .sort((a,b) => Date.parse(b.occurredAt || 0) - Date.parse(a.occurredAt || 0));
  }

  function reportCard(entry) {
    const card = document.createElement("article");
    card.className = `lykos-agent-report is-${String(entry.status || "attention").replace(/[^a-z-]/g, "")}`;
    const label = document.createElement("small");
    label.textContent = `${entry.agent.toLocaleUpperCase("fr")} · ${String(entry.type || "récapitulatif").toLocaleUpperCase("fr")}`;
    const title = document.createElement("strong");
    title.textContent = entry.title || "Récapitulatif eSupport";
    const summary = makeCollapsibleParagraph(entry.summary || "Aucun détail supplémentaire.");
    const status = document.createElement("span");
    status.className = "lykos-agent-report-status";
    status.textContent = `Statut · ${entry.statusLabel || entry.status || "information"}`;
    const time = document.createElement("time");
    time.textContent = formatDate(entry.occurredAt);
    card.append(label, title, summary, status, time);
    if (entry.content) {
      const disclosure = document.createElement("div");
      disclosure.className = "lykos-agent-report-content";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "lykos-agent-report-content-toggle";
      toggle.textContent = "Lire l’analyse complète";
      toggle.setAttribute("aria-expanded", "false");
      const full = document.createElement("div");
      full.className = "lykos-agent-report-full";
      full.textContent = entry.content;
      full.hidden = true;
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        toggle.textContent = expanded ? "Lire l’analyse complète" : "Replier l’analyse complète";
        full.hidden = expanded;
      });
      disclosure.append(toggle, full);
      card.append(disclosure);
    }
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
    if (agent !== selectedAgent) {
      selectedAgent = agent;
      agentFeedOpen = false;
    }
    const agentEntries = reportEntries().filter(entry => entry.agent === agent);
    if (agentEntries.length && !manuallyCollapsedAgentFeeds.has(agent)) agentFeedOpen = true;
    const textarea = conversation.querySelector('textarea[aria-label^="Message à "]');
    const composer = textarea?.closest("form") || textarea?.parentElement;
    if (composer) composer.hidden = true;
    if (composer?.nextElementSibling) composer.nextElementSibling.hidden = true;

    const chatHeader = conversation.querySelector("header");
    const tabs = conversation.querySelector('nav[aria-label="Contenu de l’agent"]');
    const tabButtons = tabs?.querySelectorAll("button") || [];
    if (tabButtons[0]) {
      const feedToggle = tabButtons[0];
      feedToggle.classList.add("lykos-agent-feed-toggle");
      feedToggle.textContent = agentEntries.length ? `💬 Fil de l’agent · ${agentEntries.length}` : "💬 Fil de l’agent";
      feedToggle.setAttribute("aria-expanded", String(agentFeedOpen));
      feedToggle.setAttribute("aria-label", `${agentFeedOpen ? "Replier" : "Dérouler"} le fil de ${agent}`);
      if (!feedToggle.dataset.lykosFeedToggle) {
        feedToggle.dataset.lykosFeedToggle = "true";
        feedToggle.addEventListener("click", () => {
          agentFeedOpen = !agentFeedOpen;
          if (agentFeedOpen) manuallyCollapsedAgentFeeds.delete(selectedAgent);
          else manuallyCollapsedAgentFeeds.add(selectedAgent);
          scheduleReadOnlyMode();
        });
      }
    }
    if (tabButtons[1]) tabButtons[1].hidden = true;

    const messages = conversation.querySelector('[aria-live="polite"]');
    if (messages) messages.classList.add("lykos-agent-feed-content");
    collapseLongExistingNotifications(messages);
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
    if (messages) messages.hidden = serviceMode || !agentFeedOpen;

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
      if (/^Rulebook \d+\.\d+\.\d+$/.test(version.textContent.trim())) version.textContent = "Rulebook 3.0.0";
    }

    document.getElementById("lykos-esupport-report")?.remove();
    if (!messages) return;
    let agentReports = messages.querySelector(".lykos-agent-reports");
    if (agentEntries.length) {
      if (!agentReports) {
        agentReports = document.createElement("div");
        agentReports.className = "lykos-agent-reports";
        messages.prepend(agentReports);
      }
      renderCards(agentReports, agentEntries, agentEntries.map(entry => `${entry.missionId}-${entry.sequence}-${entry.status}`).join("|"));
    } else {
      agentReports?.remove();
    }
    const emptyState = [...messages.querySelectorAll("h3")].find(node => node.textContent.includes("Aucun autre récapitulatif"))?.parentElement;
    if (emptyState) emptyState.hidden = agentEntries.length > 0;
  }

  function scheduleReadOnlyMode() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enforceReadOnlyMode);
  }

  async function loadReport(token) {
    sessionToken = token;
    try {
      const options = {cache:"no-store", credentials:"omit", headers:{Authorization:`Bearer ${token}`}};
      const [response, stateResponse] = await Promise.all([
        originalFetch(`${API}/esupport`, options),
        originalFetch(`${API}/state`, options),
      ]);
      if (response.status === 401 || stateResponse.status === 401) { sessionToken = ""; latestReport = null; latestReturns = []; scheduleReadOnlyMode(); return; }
      latestReport = response.ok ? await response.json() : null;
      const state = stateResponse.ok ? await stateResponse.json() : {};
      const displayNames = {oscar:"Oscar",sophie:"Sophie",nadir:"Nadir",alice:"Alice",victor:"Victor",giannis:"Giannis",patricia:"Patricia",gaston:"Gaston",veronique:"Véronique",sandrine:"Sandrine",leonard:"Léonard",konstantinos:"Konstantinos",kostantinos:"Konstantinos"};
      latestReturns = (Array.isArray(state.returns) ? state.returns : []).map(entry => ({
        ...entry,
        agent:displayNames[String(entry.agent || "").toLocaleLowerCase("fr")] || entry.agent,
      }));
    } catch {
      latestReport = {status:"pending", summary:"Le rapport automatique eSupport est momentanément indisponible."};
      latestReturns = [];
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
      latestReturns = [];
    }
    scheduleReadOnlyMode();
  }).observe(document.documentElement, {childList:true, subtree:true});
})();
