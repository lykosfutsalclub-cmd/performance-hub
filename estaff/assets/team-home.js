(() => {
  "use strict";

  const SERVICES = {
    direction:{label:"Direction générale",color:"#dbc35b"},
    operations:{label:"eOpérations",color:"#86b9ff"},
    sport:{label:"eSportif",color:"#80d3a2"},
    data:{label:"eDatas",color:"#75d8eb"},
    academy:{label:"eAcadémie",color:"#ffb185"},
    support:{label:"eSupport",color:"#cba0f6"},
    brand:{label:"eBrand",color:"#e78bbd"},
    security:{label:"eSécurité",color:"#e98a92"},
    finance:{label:"eFinance",color:"#dcc665"},
    equipment:{label:"eÉquipements",color:"#d4a27f"},
    partnerships:{label:"ePartenariats",color:"#e89ab0"},
    memory:{label:"eMémoire",color:"#a9bdd2"},
    hr:{label:"eRH",color:"#9e9cdd"},
  };

  const PEOPLE = [
    ["Oscar","direction","Directeur général","Coordination","Décision","Vision d’ensemble","Rassembler les expertises","Garder du temps pour les décisions qui comptent"],
    ["Sophie","operations","Responsable administrative","Organisation","Suivi","Coordination","Mettre de l’ordre dans les informations","Obtenir les éléments manquants sans délai"],
    ["Élise","operations","Référente des sources","Vérification","Cohérence","Précision","Rapprocher les informations avec méthode","Trancher lorsque deux sources se contredisent"],
    ["Léonard","sport","Conseiller sportif","Préparation","Conseil","Anticipation","Transformer les informations en préparation utile","Attendre un dossier complet avant de conclure"],
    ["Nadir","sport","Analyste vidéo","Lecture du jeu","Tactique","Synthèse","Faire parler les images avec justesse","Recevoir une vidéo exploitable au bon moment"],
    ["Victor","sport","Responsable de l’effectif","Disponibilités","Suivi humain","Anticipation","Garder une vision claire du groupe","Être informé dès qu’une situation change"],
    ["Camélia","sport","Référente de l’assiduité","Régularité","Présences","Objectivité","Suivre l’engagement avec équité","Distinguer absence, indisponibilité et oubli"],
    ["Salma","sport","Chargée des nouvelles arrivées","Accueil","Intégration","Suivi","Soigner chaque arrivée dans le groupe","Réunir les informations avant l’intégration"],
    ["Mateo","sport","Chargé des départs","Transition","Historique","Clarté","Accompagner chaque départ proprement","Éviter qu’un dossier reste inachevé"],
    ["Priya","sport","Chargée du recrutement","Prospection","Évaluation","Suivi","Faire progresser les pistes avec discernement","Garder une information suffisamment qualifiée"],
    ["Vincenzo","sport","Veille vidéo","Recherche","Patience","Vérification","Retrouver les bons matchs au bon moment","Composer avec les petites différences d’affichage"],
    ["Samir","sport","Documentaliste vidéo","Classement","Repérage","Transmission","Rendre chaque vidéo facile à exploiter","Recevoir une vidéo confirmée avant son classement"],
    ["Bastien","sport","Référent des rencontres","Calendrier","Contexte","Fiabilité","Relier chaque rencontre à son contexte","Faire confirmer les changements tardifs"],
    ["Sandrine","data","Responsable amélioration","Recul","Expérience","Propositions","Remettre l’existant en question avec tact","Prioriser les idées qui apportent un vrai bénéfice"],
    ["Giannis","data","Analyste de la performance","Interprétation","Metron","Pédagogie","Donner du sens aux performances","Éviter les conclusions hâtives sur peu de recul"],
    ["Francisco","data","Contrôleur des données","Exactitude","Cohérence","Vigilance","Repérer les anomalies avant qu’elles ne se propagent","Faire corriger la source plutôt que le symptôme"],
    ["Inès","data","Référente compréhension","Clarté","Parcours","Pédagogie","Rendre les informations faciles à comprendre","Simplifier sans perdre la nuance"],
    ["Alice","academy","Responsable Académie","Accompagnement","Planning","Continuité","Veiller au bon suivi de l’Académie","Avancer malgré les informations parfois tardives"],
    ["Roman","academy","Référent confidentialité","Discrétion","Protection","Vigilance","Protéger les informations les plus sensibles","Vérifier chaque nouvelle diffusion"],
    ["Véronique","support","Responsable eSupport","Validation","Continuité","Coordination","S’assurer que tout fonctionne vraiment","Ne valider qu’avec une confirmation claire"],
    ["Sonia","support","Référente des accès","Continuité","Accès","Réactivité","Rétablir les accès avec discrétion","Dépendre parfois d’une validation personnelle"],
    ["Patricia","support","Référente SportEasy","Surveillance","Fraîcheur","Détection","Repérer très vite ce qui manque","Différencier un retard normal d’une vraie anomalie"],
    ["Gaston","support","Référent des corrections","Diagnostic","Réparation","Fiabilité","Trouver la cause avant de corriger","Recevoir un constat assez précis pour agir vite"],
    ["Tamara","support","Référente des essais","Vérification","Parcours","Exigence","Tester les changements comme un utilisateur","Couvrir les cas rares sans ralentir l’équipe"],
    ["Konstantinos","brand","Responsable image et contenus","Identité","Contenus","Partenariats","Faire rayonner une image cohérente","Préserver l’identité sur chaque nouveau support"],
    ["Giorgios","brand","Observateur des canaux publics","Veille","Tendances","Réputation","Voir rapidement ce qui change à l’extérieur","Distinguer le bruit d’un signal utile"],
    ["Lola","brand","Chargée des publications","Rédaction","Calendrier","Tonalité","Donner une voix constante au club","Conserver le bon ton dans l’urgence"],
    ["Amara","security","Responsable de la protection","Arbitrage","Vigilance","Coordination","Porter une vision globale de la protection","Faire simple sans baisser le niveau d’exigence"],
    ["Elena","security","Référente des droits","Accès","Contrôle","Traçabilité","Donner à chacun le juste niveau d’accès","Retirer rapidement les droits devenus inutiles"],
    ["Akira","security","Gardien des secrets","Discrétion","Prévention","Rigueur","Veiller sur les informations confidentielles","Renouveler les protections au bon moment"],
    ["Joyce","security","Référente des données","Confidentialité","Partages","Respect","Protéger les données dans chaque échange","Vérifier les nouveaux partages avant diffusion"],
    ["Thiago","security","Référent des connexions","Surveillance","Domaines","Continuité","Veiller sur les liens entre les services","Réagir sans précipitation aux signaux inhabituels"],
    ["Jefferson","security","Référent des incidents","Réponse","Calme","Documentation","Garder la tête froide lorsqu’un incident survient","Réunir des faits fiables avant de conclure"],
    ["Angela","finance","Responsable financière","Suivi","Prévision","Sobriété","Garder les dépenses utiles et maîtrisées","Anticiper les variations de consommation"],
    ["Juan","equipment","Responsable équipements","Inventaire","Besoins","Disponibilité","S’assurer que chacun dispose du nécessaire","Prévoir les besoins avant qu’ils deviennent urgents"],
    ["Marco","equipment","Référent du matériel","État","Entretien","Renouvellement","Prolonger la vie du matériel","Repérer assez tôt les signes d’usure"],
    ["Rafael","partnerships","Responsable partenariats","Relations","Suivi","Opportunités","Entretenir des relations durables","Faire avancer chaque échange sans le brusquer"],
    ["Alba","memory","Gardienne de la mémoire","Histoire","Classement","Transmission","Préserver ce que le club construit","Faire vivre les archives sans les encombrer"],
    ["Nora","hr","Responsable des ressources humaines","Cadre","Équilibre","Organisation","Donner à chacun un cadre de travail juste","Adapter les rythmes aux besoins réels"],
    ["Yanis","hr","Référent de la charge de travail","Rythmes","Capacité","Alerte","Prévenir la surcharge avant qu’elle arrive","Distinguer une pointe d’activité d’un déséquilibre"],
    ["Salomé","hr","Référente des compétences","Savoir-faire","Progression","Besoins","Faire grandir les compétences utiles","Proposer des évolutions vraiment adaptées"],
    ["Malik","hr","Référent des missions","Répartition","Renfort","Priorités","Confier la bonne mission à la bonne personne","Éviter de disperser les expertises"],
    ["Ella","hr","Référente du bien-être au travail","Équilibre","Écoute","Amélioration","Préserver un rythme de travail sain","Détecter les petites frictions avant qu’elles durent"],
  ].map(([name,service,role,...rest]) => ({
    name,service,role,skills:rest.slice(0,3),strength:rest[3],attention:rest[4],
    portrait:`./assets/portraits/team/${name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}.jpg`,
  }));

  let authenticated = false;
  let homeActive = true;
  let teamState = {returns:[],agentStates:[],updatedAt:""};
  let selectedService = "all";
  let searchTerm = "";
  let renderQueued = false;

  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const validPattern = /(valid|confirm|control|termin|livr|publ|reussi|operationnel|effectue|complete|done|success)/i;
  const blockedPattern = /(bloqu|incident|echec|erreur|failed|impossible)/i;
  const activePattern = /(cours|pending|waiting|attente|incomplete|executed|validation|mission|running|started|processing)/i;

  function statusText(value) {
    const state = normalize(value);
    if (state.includes("block") || state.includes("incident")) return {label:"A besoin d’aide",tone:"help"};
    if (state.includes("incomplete")) return {label:"En attente d’un élément",tone:"waiting"};
    if (state.includes("executed") || state.includes("validation")) return {label:"En attente de validation",tone:"review"};
    if (state.includes("progress") || state.includes("cours") || state.includes("mission")) return {label:"En mission",tone:"active"};
    if (state.includes("controlled") || state.includes("disponible")) return {label:"Disponible",tone:"available"};
    return {label:"Au repos",tone:"rest"};
  }

  function dateValue(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  }

  function formatDate(value) {
    const date = dateValue(value);
    if (!date) return "Pas encore de mission enregistrée";
    const diff = Date.now() - date.getTime();
    const hours = Math.max(0,Math.floor(diff / 3600000));
    if (hours < 1) return "Il y a moins d’une heure";
    if (hours < 24) return `Il y a ${hours} h`;
    if (hours < 48) return "Hier";
    return new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(date);
  }

  function personData(person) {
    const entries = (teamState.returns || []).filter(entry => normalize(entry.agent) === normalize(person.name));
    const missions = [];
    const seen = new Set();
    for (const entry of entries) {
      const key = entry.missionId || entry.returnId || `${entry.occurredAt}-${entry.title || "mission"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      missions.push(entry);
    }
    const remote = (teamState.agentStates || []).find(entry => normalize(entry.agent) === normalize(person.name));
    const status = statusText(remote?.state || missions[0]?.status || "waiting");
    const completed = missions.filter(entry => !activePattern.test(String(entry.status || "")) && !blockedPattern.test(String(entry.status || "")));
    const validated = completed.filter(entry => validPattern.test(`${entry.status || ""} ${entry.statusLabel || ""} ${entry.classification || ""}`));
    const blocked = missions.filter(entry => blockedPattern.test(`${entry.status || ""} ${entry.statusLabel || ""} ${entry.classification || ""}`));
    const closed = completed.length + blocked.length;
    const smooth = closed ? Math.round((completed.length / closed) * 100) : null;
    const lastAt = missions[0]?.occurredAt || remote?.latestEvidenceAt || "";
    return {entries,missions,remote,status,completed,validated,blocked,smooth,lastAt};
  }

  function allMetrics() {
    const data = PEOPLE.map(person => personData(person));
    const unique = new Map();
    for (const entry of teamState.returns || []) {
      const key = entry.missionId || entry.returnId || `${entry.agent}-${entry.occurredAt}-${entry.title || "mission"}`;
      if (!unique.has(key)) unique.set(key,entry);
    }
    const missions = [...unique.values()];
    const ongoing = missions.filter(entry => activePattern.test(String(entry.status || ""))).length || data.filter(item => item.status.tone === "active").length;
    const completed = missions.filter(entry => !activePattern.test(String(entry.status || "")) && !blockedPattern.test(String(entry.status || "")));
    const validated = completed.filter(entry => validPattern.test(`${entry.status || ""} ${entry.statusLabel || ""} ${entry.classification || ""}`));
    const available = data.filter(item => ["available","rest"].includes(item.status.tone)).length;
    return {ongoing,completed:completed.length,validated:validated.length,available};
  }

  function sparkline(entries,color) {
    const days = Array(7).fill(0);
    for (const entry of entries) {
      const date = dateValue(entry.occurredAt);
      if (!date) continue;
      const ago = Math.floor((Date.now() - date.getTime()) / 86400000);
      if (ago >= 0 && ago < 7) days[6 - ago] += 1;
    }
    const max = Math.max(1,...days);
    const points = days.map((value,index) => `${index * 28},${34 - (value / max) * 26}`).join(" ");
    return `<svg class="team-sparkline" viewBox="0 0 168 40" role="img" aria-label="Activité des sept derniers jours"><polyline points="${points}"/></svg>`;
  }

  function cardTemplate(person) {
    const data = personData(person);
    const service = SERVICES[person.service];
    const score = data.smooth;
    const ring = score === null ? "—" : `${score}%`;
    const scoreClass = `score-${score === null ? 0 : Math.round(score / 5) * 5}`;
    return `<article class="team-person service-${person.service}" data-person="${person.name}">
      <button class="team-person-main" type="button" aria-label="Voir le travail de ${person.name}">
        <img src="${person.portrait}" alt="Portrait fictif de ${person.name}" loading="lazy" width="560" height="560">
        <span class="team-person-copy">
          <span class="team-person-heading"><strong>${person.name}</strong><span class="team-state team-state-${data.status.tone}"><i></i>${data.status.label}</span></span>
          <span class="team-role">${person.role} · ${service.label}</span>
          <span class="team-skills">${person.skills.map(skill => `<em>${skill}</em>`).join("")}</span>
          ${sparkline(data.entries,service.color)}
          <span class="team-last"><b>Dernière mission</b>${formatDate(data.lastAt)}</span>
        </span>
        <span class="team-person-score ${scoreClass}"><span>${ring}</span><small>Missions fluides</small></span>
      </button>
      <div class="team-person-story">
        <p><b>Son atout</b>${person.strength}</p>
        <p><b>À accompagner</b>${person.attention}</p>
        <p><b>Parcours</b>${data.completed.length} réalisée${data.completed.length === 1 ? "" : "s"} · ${data.validated.length} validée${data.validated.length === 1 ? "" : "s"}</p>
      </div>
      <button class="team-open" type="button">${person.name === "Oscar" ? "Parler à Oscar" : "Voir son travail"}<span aria-hidden="true">→</span></button>
    </article>`;
  }

  function homeTemplate() {
    const metrics = allMetrics();
    const visiblePeople = PEOPLE.filter(person => {
      const serviceMatch = selectedService === "all" || person.service === selectedService;
      const searchMatch = !searchTerm || normalize(`${person.name} ${person.role} ${SERVICES[person.service].label} ${person.skills.join(" ")}`).includes(normalize(searchTerm));
      return serviceMatch && searchMatch;
    });
    return `<section id="lykos-team-home" aria-label="Accueil de l’équipe eStaff">
      <header class="team-home-header">
        <div class="team-brand"><img src="../logo-lykos-intro-carre-2026.png" alt="Lykos Futsal Club"><span><small>Performance Hub</small><strong>Notre eStaff</strong></span></div>
        <div class="team-header-actions"><button type="button" data-team-action="threads">Voir les fils de missions</button><button type="button" data-team-action="logout">Fermer l’accès</button></div>
      </header>
      <div class="team-welcome">
        <p class="team-eyebrow">Le collectif qui veille sur le club</p>
        <h1>Bonjour, voici votre équipe.</h1>
        <p>Chaque personne met son savoir-faire au service du Lykos. Vous voyez ici où elle en est, ce qu’elle a accompli et quand elle est intervenue pour la dernière fois.</p>
      </div>
      <div class="team-metrics" aria-label="Vue d’ensemble">
        <article><span class="team-metric-icon">↗</span><p><strong>${metrics.ongoing}</strong><small>Missions en cours</small></p></article>
        <article><span class="team-metric-icon">✓</span><p><strong>${metrics.completed}</strong><small>Missions réalisées</small></p></article>
        <article><span class="team-metric-icon">★</span><p><strong>${metrics.validated}</strong><small>Validées sans blocage</small></p></article>
        <article><span class="team-metric-icon">☺</span><p><strong>${metrics.available}<sup> / ${PEOPLE.length}</sup></strong><small>Disponibles ou au repos</small></p></article>
      </div>
      <section class="team-directory" aria-labelledby="team-directory-title">
        <div class="team-directory-head">
          <div><p class="team-eyebrow">${PEOPLE.length} savoir-faire complémentaires</p><h2 id="team-directory-title">Rencontrez l’équipe</h2></div>
          <label class="team-search"><span class="sr-only">Rechercher une personne ou un savoir-faire</span><input type="search" value="${searchTerm.replace(/"/g,"&quot;")}" placeholder="Rechercher une personne ou un savoir-faire…"></label>
        </div>
        <div class="team-filters" role="list" aria-label="Filtrer par service">
          <button type="button" class="${selectedService === "all" ? "is-selected" : ""}" data-service="all">Toute l’équipe</button>
          ${Object.entries(SERVICES).map(([key,service]) => `<button type="button" class="service-${key} ${selectedService === key ? "is-selected" : ""}" data-service="${key}">${service.label}</button>`).join("")}
        </div>
        <div class="team-grid">${visiblePeople.map(cardTemplate).join("")}</div>
        ${visiblePeople.length ? "" : `<div class="team-empty"><strong>Aucun résultat pour cette recherche.</strong><span>Essayez un prénom, un service ou un savoir-faire.</span></div>`}
      </section>
      <footer class="team-home-footer"><span>Les portraits sont des représentations fictives créées pour le eStaff.</span><span>${teamState.updatedAt ? `Dernière mise à jour ${formatDate(teamState.updatedAt).toLowerCase()}` : "Les premiers travaux apparaîtront ici dès leur enregistrement."}</span></footer>
    </section>`;
  }

  function rootMain() {
    return document.querySelector("#estaff-root > main");
  }

  function renderHome() {
    renderQueued = false;
    if (!authenticated) return;
    const main = rootMain();
    if (!main || document.body.textContent.includes("Code d’accès")) return;
    let home = document.getElementById("lykos-team-home");
    if (!home) {
      home = document.createElement("section");
      home.id = "lykos-team-home";
      main.prepend(home);
    }
    if (homeActive) {
      const shell = document.createElement("div");
      shell.innerHTML = homeTemplate();
      home.replaceWith(shell.firstElementChild);
    }
    document.body.classList.toggle("lykos-team-home-active",homeActive);
    ensureReturnButton();
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(renderHome);
  }

  function ensureReturnButton() {
    let button = document.getElementById("lykos-team-return");
    if (!button) {
      button = document.createElement("button");
      button.id = "lykos-team-return";
      button.type = "button";
      button.textContent = "← Retour à l’équipe";
      button.addEventListener("click",showHome);
      document.body.append(button);
    }
    button.hidden = !authenticated || homeActive;
  }

  function showHome() {
    homeActive = true;
    scheduleRender();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function showExistingView() {
    homeActive = false;
    document.body.classList.remove("lykos-team-home-active");
    ensureReturnButton();
  }

  function findRosterButton(name) {
    return [...document.querySelectorAll("button[aria-pressed]")].find(button => normalize(button.querySelector("strong")?.textContent || button.textContent).startsWith(normalize(name)));
  }

  function openPerson(name) {
    showExistingView();
    requestAnimationFrame(() => {
      const button = findRosterButton(name);
      button?.click();
      if (name === "Oscar") setTimeout(() => document.querySelector("textarea")?.focus(),150);
      window.scrollTo({top:0,behavior:"smooth"});
    });
  }

  document.addEventListener("click", event => {
    if (!authenticated) return;
    const action = event.target.closest?.("[data-team-action]")?.dataset.teamAction;
    if (action === "threads") showExistingView();
    if (action === "logout") {
      const button = [...document.querySelectorAll("button")].find(node => {
        const label = normalize(node.textContent);
        return !node.closest("#lykos-team-home") && label.includes("fermer") && label.includes("acces");
      });
      button?.click();
    }
    const filter = event.target.closest?.("[data-service]");
    if (filter) {
      selectedService = filter.dataset.service;
      scheduleRender();
    }
    const card = event.target.closest?.(".team-person");
    if (card && (event.target.closest(".team-person-main") || event.target.closest(".team-open"))) openPerson(card.dataset.person);
  });

  document.addEventListener("input", event => {
    if (!event.target.matches?.(".team-search input")) return;
    searchTerm = event.target.value;
    const cursor = event.target.selectionStart;
    scheduleRender();
    requestAnimationFrame(() => {
      const input = document.querySelector(".team-search input");
      input?.focus();
      input?.setSelectionRange(cursor,cursor);
    });
  });

  window.addEventListener("lykos:estaff-cloud-session", event => {
    authenticated = Boolean(event.detail?.token);
    homeActive = authenticated;
    if (!authenticated) {
      document.body.classList.remove("lykos-team-home-active");
      document.getElementById("lykos-team-home")?.remove();
      document.getElementById("lykos-team-return")?.remove();
      teamState = {returns:[],agentStates:[],updatedAt:""};
      return;
    }
    setTimeout(scheduleRender,0);
  });

  window.addEventListener("lykos:estaff-team-state", event => {
    teamState = {
      returns:Array.isArray(event.detail?.returns) ? event.detail.returns : [],
      agentStates:Array.isArray(event.detail?.agentStates) ? event.detail.agentStates : [],
      updatedAt:event.detail?.updatedAt || "",
    };
    scheduleRender();
  });

  new MutationObserver(() => {
    if (authenticated && !document.getElementById("lykos-team-home")) scheduleRender();
  }).observe(document.getElementById("estaff-root"),{childList:true,subtree:true});
})();
