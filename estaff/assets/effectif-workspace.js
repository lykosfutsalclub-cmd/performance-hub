(() => {
  "use strict";

  const API = "https://lykos-estaff-service.lykosfutsalclub.workers.dev/api/estaff";
  const SESSION_EVENT = "lykos:estaff-cloud-session";
  const VIEWS = [
    ["squad", "◉", "État de l’effectif"],
    ["arrival", "↘", "Arrivées"],
    ["departure", "↗", "Départs"],
    ["prospect", "✦", "Prospects"],
    ["history", "◷", "Historique"],
  ];
  const STATUS = {
    non_renseigne:{label:"À renseigner", icon:"?", tone:"neutral"},
    disponible:{label:"Disponible", icon:"✓", tone:"success"},
    limite_declaree:{label:"Limité", icon:"!", tone:"warning"},
    indisponible_declare:{label:"Indisponible", icon:"×", tone:"danger"},
    retour_progressif_declare:{label:"Retour progressif", icon:"↗", tone:"info"},
  };
  const SOURCE = {
    fabien_perals:"Message d’origine de Fabien Perals",
    joueur:"Déclaré par le joueur",
    staff:"Déclaré par le staff",
    dirigeant:"Déclaré par un dirigeant",
    sporteasy:"Relevé dans SportEasy",
    non_precise:"Source à préciser",
  };
  const WRITABLE_SOURCE = {
    fabien_perals:"Message d’origine de Fabien Perals",
    sporteasy:"Relevé dans SportEasy",
  };
  const CASES = {
    arrival:{label:"Arrivée", plural:"Arrivées", icon:"↘", tone:"arrival"},
    departure:{label:"Départ", plural:"Départs", icon:"↗", tone:"departure"},
    prospect:{label:"Prospect", plural:"Prospects", icon:"✦", tone:"prospect"},
  };
  const TRANSFER_AGENTS = {
    salma:{
      id:"salma", name:"Salma", initials:"SA", type:"arrival", icon:"↘", tone:"arrival",
      portrait:"assets/portraits/active/salma-v1.png",
      role:"Coordinatrice des nouvelles arrivées",
      purpose:"Transformer chaque arrivée confirmée en intégration complète, traçable et sans oubli.",
      cadence:"Contrôle quotidien à 10 h 35, puis à chaque nouvelle arrivée.",
      trigger:"Nouveau joueur détecté ou arrivée confirmée par un dirigeant.",
      output:"Dossier d’arrivée complet, prochaine action attribuée et synthèse prête pour Oscar.",
      limit:"Elle prépare et coordonne ; la décision d’intégrer reste humaine.",
      workflow:[
        ["Patricia", "détecte la donnée source"], ["Salma", "ouvre et pilote le dossier"],
        ["Sophie", "vérifie l’administratif"], ["Victor", "cadre l’intégration sportive"],
        ["Camélia", "contrôle les faits d’assiduité"], ["Joyce · Francisco", "protègent et contrôlent les données"],
        ["Oscar", "valide la synthèse"], ["Dirigeant", "décide"],
      ],
    },
    mateo:{
      id:"mateo", name:"Mateo", initials:"MA", type:"departure", icon:"↗", tone:"departure",
      portrait:"assets/portraits/active/mateo-v1.png",
      role:"Coordinateur des départs confirmés",
      purpose:"Sécuriser chaque sortie d’effectif sans jamais déduire un départ d’une simple absence.",
      cadence:"Contrôle le lundi et le jeudi à 10 h 35, puis à chaque départ signalé.",
      trigger:"Départ explicitement signalé et à confirmer par un dirigeant.",
      output:"Dossier de sortie vérifié, impacts identifiés et synthèse prête pour Oscar.",
      limit:"Il ne confirme jamais seul un départ et n’interprète pas une absence comme un départ.",
      workflow:[
        ["Patricia", "relève le signal explicite"], ["Dirigeant", "confirme explicitement le départ", true],
        ["Mateo", "ouvre et pilote le dossier confirmé"],
        ["Sophie", "vérifie l’administratif"], ["Victor", "mesure l’impact sportif"],
        ["Camélia", "contrôle les faits d’assiduité"], ["Joyce · Francisco", "protègent et contrôlent les données"],
        ["Oscar", "valide la synthèse"], ["Dirigeant", "décide la clôture", true],
      ],
    },
    priya:{
      id:"priya", name:"Priya", initials:"PR", type:"prospect", icon:"✦", tone:"prospect",
      portrait:"assets/portraits/active/priya-v1.png",
      role:"Coordinatrice des prospects et du recrutement",
      purpose:"Faire avancer les prospects utiles avec une information minimale, fiable et directement exploitable.",
      cadence:"Contrôle le lundi, mercredi et vendredi à 10 h 35, puis à chaque nouveau prospect.",
      trigger:"Besoin sportif validé par Victor ou nouveau prospect ajouté au registre.",
      output:"Fiche de suivi factuelle, état du recrutement et décision attendue clairement indiqués.",
      limit:"Les contacts, essais, offres et recrutements restent des décisions humaines.",
      workflow:[
        ["Victor", "formalise le besoin sportif"], ["Priya", "qualifie et pilote le suivi"],
        ["Sophie", "vérifie les faits autorisés"], ["Joyce · Francisco", "protègent et contrôlent les données"],
        ["Oscar", "valide la synthèse"], ["Dirigeant", "décide"],
      ],
    },
  };
  const STEP_LABELS = {
    a_preparer:"À préparer",
    documents_en_cours:"Documents en cours",
    arrivee_confirmee:"Arrivée confirmée",
    integre:"Intégré",
    a_confirmer:"À confirmer",
    depart_confirme:"Départ confirmé par un dirigeant",
    sortie_en_cours:"Sortie en cours",
    termine:"Terminé",
    identifie:"Identifié",
    a_contacter:"À contacter",
    contacte:"Contacté",
    evaluation:"Évaluation",
    decision:"Décision",
    clos:"Clos",
  };
  const AGENT_ROLES = {
    Victor:"coordonne l’état de l’effectif et les besoins sportifs.",
    Sophie:"confirme les identités et les faits administratifs.",
    Camélia:"consolide uniquement les faits d’assiduité autorisés.",
    Joyce:"contrôle la confidentialité et la minimisation des données.",
    Patricia:"surveille la fraîcheur des données sources.",
    Francisco:"contrôle la cohérence des données utilisées.",
    "Joyce · Francisco":"protègent les données et en vérifient la cohérence.",
    "Patricia · Francisco":"vérifient la fraîcheur et la cohérence des sources.",
    Oscar:"valide la synthèse et remonte les décisions au dirigeant.",
    Dirigeant:"conserve la décision finale et les actes engageants.",
    Salma:"prépare et coordonne les nouvelles arrivées.",
    Mateo:"sécurise les récents départs sans jamais les déduire d’une absence.",
    Priya:"qualifie les prospects et structure les phases de recrutement.",
  };

  let sessionToken = "";
  let authenticated = false;
  let opened = false;
  let activeView = "squad";
  let observerQueued = false;
  let loading = false;
  let dataReady = false;
  let players = [];
  let state = {statuses:[], cases:[], caseSteps:{}, workflowEvents:[]};
  let statusFilter = "all";
  let openTransferAgent = "";

  function make(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function requestedByUrl() {
    return new URLSearchParams(location.search).get("workspace") === "effectif";
  }

  function updateUrl(show) {
    const url = new URL(location.href);
    if (show) url.searchParams.set("workspace", "effectif");
    else url.searchParams.delete("workspace");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "Non renseignée";
    const date = includeTime ? new Date(value) : new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "Non renseignée";
    return new Intl.DateTimeFormat("fr-FR", includeTime
      ? {dateStyle:"medium", timeStyle:"short", timeZone:"Europe/Paris"}
      : {dateStyle:"medium"}).format(date);
  }

  function humanError(code) {
    const errors = {
      unauthorized:"Votre accès privé a expiré. Saisissez de nouveau votre code.",
      invalid_availability:"La disponibilité, la source ou la date est incorrecte.",
      invalid_case:"Le dossier contient une valeur incorrecte ou trop longue.",
      invalid_case_step:"Cette étape ne correspond pas à ce type de dossier.",
      case_step_sequence:"Le dossier ne peut avancer que d’une seule étape à la fois.",
      invalid_case_link:"Le dossier prospect lié est incorrect.",
      prospect_not_ready_for_arrival:"Le prospect doit atteindre l’étape « Décision » avant de devenir une arrivée.",
      prospect_already_linked:"Un dossier d’arrivée existe déjà pour ce prospect.",
      case_link_immutable:"Le lien entre le prospect et l’arrivée ne peut pas être remplacé.",
      case_source_immutable:"La provenance du dossier est définitive et ne peut pas être remplacée.",
      sport_source_not_fabien:"Une information issue d’une conversation ne peut être enregistrée comme donnée sportive que si le message d’origine est de Fabien Perals.",
      health_detail_forbidden:"Aucun détail médical ne doit être saisi ici. Utilisez seulement un état de disponibilité.",
      effectif_storage_limit:"La capacité du registre est atteinte. Oscar doit être alerté.",
      effectif_storage_unavailable:"Le registre privé est momentanément indisponible.",
      json_required:"La demande n’a pas pu être transmise correctement.",
    };
    return errors[code] || "Le registre privé ne répond pas pour le moment. Réessayez dans quelques instants.";
  }

  function showFeedback(message, tone = "info") {
    const node = document.querySelector(".ew-feedback");
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
    node.hidden = false;
  }

  function hideFeedback() {
    const node = document.querySelector(".ew-feedback");
    if (node) node.hidden = true;
  }

  function clearWorkspace() {
    sessionToken = "";
    authenticated = false;
    opened = false;
    loading = false;
    dataReady = false;
    players = [];
    state = {statuses:[], cases:[], caseSteps:{}, workflowEvents:[]};
    openTransferAgent = "";
    document.body.classList.remove("effectif-workspace-open");
    document.getElementById("effectif-workspace")?.remove();
    document.getElementById("effectif-workspace-button")?.remove();
  }

  async function privateRequest(path, options = {}) {
    if (!sessionToken) throw new Error("unauthorized");
    const response = await fetch(`${API}/${path}`, {
      ...options,
      cache:"no-store",
      credentials:"omit",
      headers:{
        ...(options.body ? {"Content-Type":"application/json"} : {}),
        Authorization:`Bearer ${sessionToken}`,
        ...(options.headers || {}),
      },
    });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent(SESSION_EVENT, {detail:{token:""}}));
      throw new Error("unauthorized");
    }
    if (!response.ok) throw new Error(payload.error || "request_failed");
    return payload;
  }

  async function loadCurrentPlayers() {
    const response = await fetch("../index.html", {cache:"no-store", credentials:"omit"});
    if (!response.ok) throw new Error("roster_unavailable");
    const source = new DOMParser().parseFromString(await response.text(), "text/html");
    const roster = [...source.querySelectorAll('.lykos-nav button[data-player][data-current="true"]')].map(button => ({
      id:button.dataset.playerId || "",
      name:(button.dataset.player || "").trim(),
    })).filter(item => item.id && item.name);
    return [...new Map(roster.map(item => [item.id, item])).values()];
  }

  async function loadData({announce = false} = {}) {
    if (!authenticated || loading) return;
    loading = true;
    dataReady = false;
    renderCurrentView();
    try {
      const [payload, roster] = await Promise.all([privateRequest("effectif-transfers"), loadCurrentPlayers()]);
      state = payload;
      const storedOnly = (payload.statuses || []).map(item => ({id:item.playerId, name:item.playerName}));
      players = [...new Map([...roster, ...storedOnly].map(item => [item.id, item])).values()]
        .sort((left, right) => left.name.localeCompare(right.name, "fr"));
      dataReady = true;
      if (announce) showFeedback("Données privées actualisées.", "success");
    } catch (error) {
      dataReady = false;
      showFeedback(error.message === "roster_unavailable"
        ? "Le registre privé répond, mais la liste publique de l’effectif est momentanément illisible."
        : humanError(error.message), "error");
    } finally {
      loading = false;
      renderCurrentView();
    }
  }

  function installNavigation() {
    if (!authenticated) return;
    const form = document.querySelector("#estaff-root main > header form");
    if (!form) return;
    let button = document.getElementById("effectif-workspace-button");
    if (!button) {
      button = make("button", "effectif-workspace-button");
      button.id = "effectif-workspace-button";
      button.type = "button";
      button.setAttribute("aria-label", "Ouvrir l’espace Effectif et transferts");
      const icon = make("span", "", "◎");
      icon.setAttribute("aria-hidden", "true");
      button.append(icon, make("span", "", "Effectif & transferts"));
      button.addEventListener("click", openWorkspace);
      form.prepend(button);
    }
    button.setAttribute("aria-pressed", String(opened));
  }

  function createWorkspace() {
    if (!authenticated) return null;
    let workspace = document.getElementById("effectif-workspace");
    if (workspace) return workspace;
    workspace = make("section");
    workspace.id = "effectif-workspace";
    workspace.hidden = true;
    workspace.setAttribute("aria-label", "Effectif et transferts");
    workspace.innerHTML = `
      <div class="ew-shell">
        <header class="ew-hero">
          <div>
            <p class="ew-eyebrow">ESPACE PRIVÉ · PILOTAGE INTERNE</p>
            <h1>Effectif <span>&amp;</span> transferts</h1>
            <p>Suivez les disponibilités déclarées et les dossiers sportifs dans un espace clair, sans donnée médicale.</p>
          </div>
          <div class="ew-actions">
            <button type="button" data-action="back"><span aria-hidden="true">←</span> Revenir au eStaff</button>
            <button type="button" data-action="refresh"><span aria-hidden="true">↻</span> Actualiser</button>
          </div>
        </header>
        <aside class="ew-source-policy" aria-label="Règle de provenance sportive">
          <strong>Règle de provenance sportive</strong>
          <p>Dans une conversation, seul un message écrit par Fabien Perals peut alimenter une donnée sportive. Les messages des autres membres restent du contexte à confirmer. SportEasy conserve son rôle de source officielle distincte.</p>
        </aside>
        <section class="ew-team" aria-labelledby="ew-team-title">
          <div class="ew-team-heading"><p>LE CIRCUIT DE CONFIANCE</p><h2 id="ew-team-title">Six regards, une décision lisible</h2></div>
          <ol>
            <li><button type="button" data-agent-role="Victor"><span aria-hidden="true">V</span><strong>Victor</strong><small>pilote l’effectif</small></button></li>
            <li><button type="button" data-agent-role="Sophie"><span aria-hidden="true">S</span><strong>Sophie</strong><small>cadre les dossiers</small></button></li>
            <li><button type="button" data-agent-role="Camélia"><span aria-hidden="true">C</span><strong>Camélia</strong><small>mesure les faits</small></button></li>
            <li><button type="button" data-agent-role="Joyce"><span aria-hidden="true">J</span><strong>Joyce</strong><small>protège les données</small></button></li>
            <li><button type="button" data-agent-role="Patricia · Francisco"><span aria-hidden="true">P·F</span><strong>Patricia · Francisco</strong><small>contrôlent la fiabilité</small></button></li>
            <li><button type="button" data-agent-role="Oscar"><span aria-hidden="true">O</span><strong>Oscar</strong><small>valide la synthèse</small></button></li>
          </ol>
        </section>
        <nav class="ew-tabs" role="tablist" aria-label="Vues de l’effectif"></nav>
        <div class="ew-feedback" role="status" aria-live="polite" hidden></div>
        <main class="ew-content" tabindex="-1"></main>
      </div>`;
    document.body.append(workspace);
    workspace.querySelector('[data-action="back"]').addEventListener("click", closeWorkspace);
    workspace.querySelector('[data-action="refresh"]').addEventListener("click", event => {
      event.currentTarget.disabled = true;
      loadData({announce:true}).finally(() => { event.currentTarget.disabled = false; });
    });
    workspace.querySelectorAll("[data-agent-role]").forEach(button => button.addEventListener("click", () => {
      const name = button.dataset.agentRole;
      showFeedback(`${name} ${AGENT_ROLES[name]}`, "agent");
    }));
    renderTabs(workspace);
    renderView(workspace);
    return workspace;
  }

  function renderTabs(workspace) {
    const tabs = workspace.querySelector(".ew-tabs");
    VIEWS.forEach(([id, icon, label], index) => {
      const button = make("button");
      button.type = "button";
      button.role = "tab";
      button.dataset.view = id;
      button.setAttribute("aria-selected", String(id === activeView));
      button.tabIndex = id === activeView ? 0 : -1;
      const mark = make("span", "", icon);
      mark.setAttribute("aria-hidden", "true");
      button.append(mark, make("span", "", label));
      button.addEventListener("click", () => selectView(id));
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? VIEWS.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + VIEWS.length) % VIEWS.length;
        selectView(VIEWS[next][0]);
        tabs.children[next]?.focus();
      });
      tabs.append(button);
    });
  }

  function selectView(view, preserveAgent = false) {
    if (!VIEWS.some(item => item[0] === view)) return;
    activeView = view;
    if (!preserveAgent && CASES[view]) openTransferAgent = "";
    hideFeedback();
    const workspace = document.getElementById("effectif-workspace");
    if (!workspace) return;
    workspace.querySelectorAll('[role="tab"]').forEach(button => {
      const selected = button.dataset.view === view;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    renderView(workspace);
  }

  function summaryCards() {
    const statuses = new Map((state.statuses || []).map(item => [item.playerId, item]));
    const open = type => (state.cases || []).filter(item => item.type === type && item.step !== "clos").length;
    const known = players.filter(player => (statuses.get(player.id)?.status || "non_renseigne") !== "non_renseigne").length;
    const summary = make("section", "ew-summary");
    summary.setAttribute("aria-label", "Résumé de l’effectif et des transferts");
    [["◉", `${known}/${players.length}`, "disponibilités renseignées", ""], ["↘", open("arrival"), "arrivées ouvertes", "arrival"], ["↗", open("departure"), "départs ouverts", "departure"], ["✦", open("prospect"), "prospects suivis", "prospect"]].forEach(([icon, value, label, tone]) => {
      const card = make("article", `ew-kpi ${tone}`);
      const mark = make("span", "", icon);
      mark.setAttribute("aria-hidden", "true");
      card.append(mark, make("strong", "", value), make("small", "", label));
      summary.append(card);
    });
    return summary;
  }

  function sectionHeading(kicker, title, note) {
    const heading = make("header", "ew-section-heading");
    const copy = make("div");
    copy.append(make("p", "", kicker), make("h2", "", title));
    heading.append(copy, make("small", "", note));
    return heading;
  }

  function emptyState(icon, title, text) {
    const empty = make("section", "ew-empty");
    const mark = make("span", "", icon);
    mark.setAttribute("aria-hidden", "true");
    empty.append(mark, make("h2", "", title), make("p", "", text));
    return empty;
  }

  function loadingState(content) {
    content.append(emptyState("↻", "Chargement sécurisé…", "Le registre privé de l’effectif est en cours de lecture."));
  }

  function renderStatusFilters(content) {
    const filters = make("div", "ew-filters");
    filters.setAttribute("aria-label", "Filtrer l’effectif par disponibilité");
    [["all", "Tous", "◎"], ...Object.entries(STATUS).map(([id, item]) => [id, item.label, item.icon])].forEach(([id, label, icon]) => {
      const button = make("button", `ew-filter ${id === "all" ? "neutral" : STATUS[id].tone}`);
      button.type = "button";
      button.dataset.filter = id;
      button.setAttribute("aria-pressed", String(statusFilter === id));
      button.append(make("span", "", icon), make("span", "", label));
      button.addEventListener("click", () => { statusFilter = id; renderCurrentView(); });
      filters.append(button);
    });
    content.append(filters);
  }

  function renderSquad(content) {
    content.append(summaryCards(), sectionHeading("◉ SUIVI INTERNE", "État de l’effectif", "Disponibilité déclarée · aucun diagnostic médical"));
    renderStatusFilters(content);
    const byPlayer = new Map((state.statuses || []).map(item => [item.playerId, item]));
    const visiblePlayers = players.filter(player => statusFilter === "all" || (byPlayer.get(player.id)?.status || "non_renseigne") === statusFilter);
    if (!visiblePlayers.length) {
      content.append(emptyState("◎", "Aucun joueur dans ce filtre", "Choisissez une autre couleur de disponibilité."));
      return;
    }
    const grid = make("section", "ew-grid ew-squad-grid");
    visiblePlayers.forEach(player => {
      const record = byPlayer.get(player.id) || {playerId:player.id, playerName:player.name, status:"non_renseigne", source:"non_precise", reviewAt:""};
      const status = STATUS[record.status] || STATUS.non_renseigne;
      const card = make("article", `ew-card ${status.tone}`);
      const header = make("header");
      const person = make("div", "ew-person");
      const initials = player.name.split(/\s+/u).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("fr");
      person.append(make("span", "", initials), make("div"));
      person.lastChild.append(make("h3", "", player.name), make("small", "", record.updatedAt ? `Mis à jour ${formatDate(record.updatedAt, true)}` : "État à renseigner"));
      header.append(person, make("span", `ew-pill ${status.tone}`, `${status.icon} ${status.label}`));
      const details = make("div", "ew-details");
      details.append(make("strong", "", "Source et révision"), make("p", "", `${SOURCE[record.source] || SOURCE.non_precise} · Révision : ${formatDate(record.reviewAt)}`));
      const editor = document.createElement("form");
      editor.className = "ew-status-editor";
      editor.hidden = true;
      editor.dataset.playerId = player.id;
      const choices = make("div", "ew-status-choices");
      choices.setAttribute("role", "radiogroup");
      Object.entries(STATUS).forEach(([id, item]) => {
        const label = make("label", `ew-choice ${item.tone}`);
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `status-${player.id}`;
        input.value = id;
        input.checked = record.status === id;
        label.append(input, make("span", "", item.icon), make("b", "", item.label));
        choices.append(label);
      });
      const meta = make("div", "ew-form-row");
      const sourceLabel = make("label", "", "Source");
      const sourceSelect = document.createElement("select");
      sourceSelect.name = "source";
      sourceSelect.required = true;
      if (!WRITABLE_SOURCE[record.source]) sourceSelect.add(new Option("Choisir une provenance autorisée", "", true, true));
      Object.entries(WRITABLE_SOURCE).forEach(([id, label]) => sourceSelect.add(new Option(label, id, false, record.source === id)));
      sourceLabel.append(sourceSelect);
      const dateLabel = make("label", "", "Revoir le");
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.name = "reviewAt";
      dateInput.value = record.reviewAt || "";
      dateLabel.append(dateInput);
      meta.append(sourceLabel, dateLabel);
      const actions = make("div", "ew-form-actions");
      const cancel = make("button", "ew-button-secondary", "Annuler");
      cancel.type = "button";
      cancel.addEventListener("click", () => { editor.hidden = true; });
      const save = make("button", "ew-button-primary", "Enregistrer l’état");
      save.type = "submit";
      actions.append(cancel, save);
      editor.append(choices, meta, actions);
      editor.addEventListener("submit", async event => {
        event.preventDefault();
        if (!dataReady) return;
        const selected = new FormData(editor).get(`status-${player.id}`);
        if (!selected) return showFeedback("Choisissez d’abord un état coloré.", "error");
        save.disabled = true;
        try {
          const payload = await privateRequest("effectif-transfers/status", {
            method:"POST",
            body:JSON.stringify({playerId:player.id, playerName:player.name, status:selected, source:sourceSelect.value, reviewAt:dateInput.value}),
          });
          const current = (state.statuses || []).filter(item => item.playerId !== player.id);
          state.statuses = [...current, payload.availability];
          showFeedback(`${player.name} · état enregistré.`, "success");
          renderCurrentView();
        } catch (error) {
          showFeedback(humanError(error.message), "error");
          save.disabled = false;
        }
      });
      const footer = make("footer");
      const edit = make("button", "ew-edit-button", "Mettre à jour");
      edit.type = "button";
      edit.addEventListener("click", () => { editor.hidden = !editor.hidden; if (!editor.hidden) editor.querySelector("input:checked")?.focus(); });
      footer.append(edit);
      card.append(header, details, editor, footer);
      grid.append(card);
    });
    content.append(grid);
  }

  function transferAgentEvents(agent) {
    const rawEvents = Array.isArray(state.workflowEvents)
      ? state.workflowEvents
      : Array.isArray(state.events) ? state.events : [];
    const events = rawEvents.filter(event => {
      const owner = String(event.ownerId || event.agentId || "").toLocaleLowerCase("fr");
      return owner === agent.id || (!owner && event.caseType === agent.type);
    }).map(event => ({
      date:event.occurredAt || event.updatedAt || event.createdAt || "",
      title:event.title || event.caseName || "Passage du workflow",
      description:event.summary || event.description || "Contrôle enregistré dans le workflow privé.",
    }));
    if (events.length) return events.sort((left, right) => Date.parse(right.date) - Date.parse(left.date)).slice(0, 8);
    return (state.cases || []).filter(item => item.type === agent.type).map(item => ({
      date:item.updatedAt || item.createdAt || "",
      title:item.name,
      description:`Dossier à l’étape « ${STEP_LABELS[item.step] || item.step} »${item.nextAction ? ` · ${item.nextAction}` : ""}`,
    })).sort((left, right) => Date.parse(right.date) - Date.parse(left.date)).slice(0, 8);
  }

  function describeWorkflowActor(name, action) {
    const description = AGENT_ROLES[name] || action || "intervient dans le circuit validé de ce dossier.";
    showFeedback(`${name} — ${description}`, "agent");
  }

  function workflowStages(agent) {
    const remote = state.caseWorkflows?.[agent.type]?.chain;
    if (!Array.isArray(remote) || !remote.length) {
      return agent.workflow.map(([actor, action, humanOnly = false]) => ({actor, action, humanOnly}));
    }
    const names = {
      patricia:"Patricia", salma:"Salma", mateo:"Mateo", priya:"Priya", sophie:"Sophie",
      victor:"Victor", camelia:"Camélia", joyce:"Joyce", francisco:"Francisco", oscar:"Oscar",
    };
    return remote.map(stage => ({
      actor:stage.humanOnly ? "Dirigeant" : (stage.agents || []).map(id => names[id] || id).join(" · ") || "Validation",
      action:stage.mission,
      humanOnly:Boolean(stage.humanOnly),
    }));
  }

  function transferAgentSpace(agent) {
    const space = make("section", `ew-agent-space ${agent.tone}`);
    space.id = `ew-agent-space-${agent.id}`;
    space.setAttribute("aria-labelledby", `ew-agent-title-${agent.id}`);

    const header = make("header", "ew-agent-space-header");
    const identity = make("div", "ew-agent-identity");
    const avatar = make("span", "ew-agent-avatar");
    const portrait = document.createElement("img");
    portrait.src = agent.portrait;
    portrait.alt = `Portrait de ${agent.name}`;
    avatar.append(portrait);
    avatar.setAttribute("aria-hidden", "true");
    const name = make("div");
    name.append(make("p", "ew-agent-status", "AGENT ACTIF · eSPORTIF"));
    const title = make("h2", "", agent.name);
    title.id = `ew-agent-title-${agent.id}`;
    name.append(title, make("strong", "", agent.role), make("p", "", agent.purpose));
    identity.append(avatar, name);
    const close = make("button", "ew-agent-close", "Refermer");
    close.type = "button";
    close.setAttribute("aria-label", `Refermer l’espace de ${agent.name}`);
    close.addEventListener("click", () => { openTransferAgent = ""; renderCurrentView(); });
    header.append(identity, close);

    const facts = make("div", "ew-agent-facts");
    [["⏱", "Rythme prévu", agent.cadence], ["⚡", "Déclenchement", agent.trigger], ["✓", "Résultat attendu", agent.output], ["◇", "Cadre humain", agent.limit]].forEach(([icon, label, value]) => {
      const fact = make("article");
      fact.append(make("span", "", icon), make("div"));
      fact.lastChild.append(make("strong", "", label), make("p", "", value));
      facts.append(fact);
    });

    const workflow = make("section", "ew-agent-workflow");
    const workflowHeading = make("header");
    workflowHeading.append(make("div", "", "WORKFLOW IMBRIQUÉ"), make("p", "", "Cliquez sur une étape pour comprendre le rôle de chacun."));
    const chain = make("ol");
    workflowStages(agent).forEach(({actor, action, humanOnly}, index) => {
      const item = make("li", actor === agent.name ? "owner" : humanOnly ? "human" : "");
      const button = make("button");
      button.type = "button";
      button.setAttribute("aria-label", `${actor} : ${action}`);
      button.append(make("span", "", String(index + 1).padStart(2, "0")), make("strong", "", actor), make("small", "", action));
      button.addEventListener("click", () => describeWorkflowActor(actor, action));
      item.append(button);
      chain.append(item);
    });
    workflow.append(workflowHeading, chain);

    const feed = make("section", "ew-agent-feed");
    const feedHeader = make("header");
    feedHeader.append(make("div", "", `Fil de ${agent.name}`), make("span", "", "LECTURE SEULE"));
    const events = transferAgentEvents(agent);
    if (!events.length) {
      const empty = make("div", "ew-agent-feed-empty");
      empty.append(make("span", "", "💬"), make("strong", "", "Aucune mission enregistrée pour le moment"), make("p", "", `${agent.name} publiera ici les évolutions utiles et conservera les contrôles silencieux dans le journal privé.`));
      feed.append(feedHeader, empty);
    } else {
      const list = make("ol");
      events.forEach(event => {
        const item = make("li");
        const mark = make("span", "", agent.icon);
        mark.setAttribute("aria-hidden", "true");
        const copy = make("div");
        copy.append(make("strong", "", event.title), make("p", "", event.description), make("small", "", formatDate(event.date, true)));
        item.append(mark, copy);
        list.append(item);
      });
      feed.append(feedHeader, list);
    }

    const notice = make("p", "ew-agent-notice", `${agent.name} fait partie des 45 personnes actives de l’eStaff. Son contrôle suit les règles métier validées et reste traçable.`);
    space.append(header, facts, workflow, feed, notice);
    return space;
  }

  function renderTransferAgents(content, currentType) {
    const section = make("section", "ew-transfer-team");
    const heading = make("header");
    heading.append(make("div", "", "CELLULE TRANSFERTS"), make("p", "", "Trois espaces distincts · chacun relié au eStaff existant"));
    const rail = make("div", "ew-transfer-agent-rail");
    Object.values(TRANSFER_AGENTS).forEach(agent => {
      const button = make("button", `ew-transfer-agent ${agent.tone}${agent.type === currentType ? " current" : ""}`);
      const expanded = openTransferAgent === agent.id;
      button.type = "button";
      button.setAttribute("aria-expanded", String(expanded));
      button.setAttribute("aria-controls", `ew-agent-space-${agent.id}`);
      button.append(make("span", "ew-transfer-agent-icon", agent.icon), make("span", "ew-transfer-agent-copy"), make("span", "ew-transfer-agent-arrow", expanded ? "−" : "+"));
      button.children[1].append(make("strong", "", agent.name), make("small", "", agent.role));
      button.addEventListener("click", () => {
        openTransferAgent = expanded ? "" : agent.id;
        if (!expanded && activeView !== agent.type) selectView(agent.type, true);
        else renderCurrentView();
      });
      rail.append(button);
    });
    section.append(heading, rail);
    content.append(section);
    const selected = Object.values(TRANSFER_AGENTS).find(agent => agent.id === openTransferAgent && agent.type === currentType);
    if (selected) content.append(transferAgentSpace(selected));
  }

  function caseForm(type) {
    const definition = CASES[type];
    const form = document.createElement("form");
    form.className = `ew-case-form ${definition.tone}`;
    const title = make("div", "ew-case-form-title");
    title.append(make("span", "", definition.icon), make("div"));
    title.lastChild.append(make("strong", "", `Nouveau dossier · ${definition.label}`), make("small", "", "Un nom et une prochaine action suffisent."));
    const fields = make("div", "ew-case-fields");
    const nameLabel = make("label", "", type === "prospect" ? "Nom du prospect" : "Nom du joueur");
    const name = document.createElement("input");
    name.name = "name";
    name.required = true;
    name.maxLength = 80;
    name.autocomplete = "off";
    name.placeholder = "Nom et prénom";
    nameLabel.append(name);
    const actionLabel = make("label", "", "Prochaine action (sans détail médical)");
    const action = document.createElement("input");
    action.name = "nextAction";
    action.maxLength = 280;
    action.autocomplete = "off";
    action.placeholder = "Ex. vérifier les documents vendredi";
    actionLabel.append(action);
    const sourceLabel = make("label", "", "Provenance sportive");
    const source = document.createElement("select");
    source.name = "source";
    source.required = true;
    source.add(new Option("Choisir une provenance autorisée", "", true, true));
    Object.entries(WRITABLE_SOURCE).forEach(([id, label]) => source.add(new Option(label, id)));
    sourceLabel.append(source);
    const submit = make("button", "ew-button-primary", `${definition.icon} Créer le dossier`);
    submit.type = "submit";
    fields.append(nameLabel, actionLabel, sourceLabel, submit);
    form.append(title, fields);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!dataReady) return;
      submit.disabled = true;
      try {
        const payload = await privateRequest("effectif-transfers/case", {
          method:"POST",
          body:JSON.stringify({type, name:name.value, nextAction:action.value, source:source.value}),
        });
        state.cases = [payload.case, ...(state.cases || []).filter(item => item.id !== payload.case.id)];
        showFeedback(`${definition.label} · dossier créé.`, "success");
        renderCurrentView();
      } catch (error) {
        showFeedback(humanError(error.message), "error");
        submit.disabled = false;
      }
    });
    return form;
  }

  function renderCases(content, type) {
    const definition = CASES[type];
    content.append(summaryCards(), sectionHeading(`${definition.icon} PIPELINE PRIVÉ`, definition.plural, "Faits vérifiés · décision humaine"));
    renderTransferAgents(content, type);
    content.append(caseForm(type));
    const cases = (state.cases || []).filter(item => item.type === type);
    if (!cases.length) {
      content.append(emptyState(definition.icon, `Aucun dossier · ${definition.plural.toLowerCase()}`, "Créez le premier dossier avec le bouton coloré ci-dessus."));
      return;
    }
    const grid = make("section", "ew-grid ew-case-grid");
    cases.forEach(item => {
      const card = make("article", `ew-card ${definition.tone}`);
      const header = make("header");
      const person = make("div", "ew-person");
      person.append(make("span", "", definition.icon), make("div"));
      person.lastChild.append(make("h3", "", item.name), make("small", "", `Mis à jour ${formatDate(item.updatedAt, true)}`));
      header.append(person, make("span", `ew-pill ${definition.tone}`, STEP_LABELS[item.step] || item.step));
      const details = make("div", "ew-details");
      details.append(
        make("strong", "", "Prochaine action"),
        make("p", "", item.nextAction || "Aucune action renseignée."),
        make("strong", "", "Provenance sportive"),
        make("p", "", SOURCE[item.source] || SOURCE.non_precise),
      );
      const form = document.createElement("form");
      form.className = "ew-case-editor";
      const stepLabel = make("label", "", "Faire avancer le dossier");
      const select = document.createElement("select");
      select.name = "step";
      const allSteps = state.caseSteps?.[type] || [];
      const currentIndex = allSteps.indexOf(item.step);
      const allowedSteps = currentIndex < 0 ? [item.step] : allSteps.slice(currentIndex, currentIndex + 2);
      allowedSteps.forEach(step => select.add(new Option(STEP_LABELS[step] || step, step, false, item.step === step)));
      stepLabel.append(select);
      const nextLabel = make("label", "", "Prochaine action");
      const next = document.createElement("input");
      next.name = "nextAction";
      next.maxLength = 280;
      next.value = item.nextAction || "";
      next.autocomplete = "off";
      nextLabel.append(next);
      const sourceLabel = make("label", "", "Provenance sportive");
      const source = document.createElement("select");
      source.name = "source";
      source.required = true;
      if (!WRITABLE_SOURCE[item.source]) source.add(new Option("Choisir une provenance autorisée", "", true, true));
      Object.entries(WRITABLE_SOURCE).forEach(([id, label]) => source.add(new Option(label, id, false, item.source === id)));
      source.disabled = Boolean(WRITABLE_SOURCE[item.source]);
      sourceLabel.append(source);
      const save = make("button", "ew-button-primary", "Mettre à jour");
      save.type = "submit";
      form.append(stepLabel, nextLabel, sourceLabel, save);
      form.addEventListener("submit", async event => {
        event.preventDefault();
        save.disabled = true;
        try {
          const payload = await privateRequest("effectif-transfers/case", {
            method:"POST",
            body:JSON.stringify({id:item.id, type, name:item.name, step:select.value, nextAction:next.value, source:source.value}),
          });
          state.cases = [payload.case, ...(state.cases || []).filter(existing => existing.id !== item.id)];
          showFeedback(`${item.name} · dossier mis à jour.`, "success");
          renderCurrentView();
        } catch (error) {
          showFeedback(humanError(error.message), "error");
          save.disabled = false;
        }
      });
      card.append(header, details, form);
      if (type === "prospect" && item.step === "decision") {
        const conversion = make("footer", "ew-case-conversion");
        if (item.linkedArrivalCaseId) {
          conversion.append(make("span", "ew-linked-case", "✓ Dossier d’arrivée lié"));
        } else {
          const convert = make("button", "ew-button-secondary", "↘ Créer l’arrivée liée");
          convert.type = "button";
          convert.addEventListener("click", async () => {
            if (!window.confirm(`Créer le dossier d’arrivée lié pour ${item.name} ?`)) return;
            convert.disabled = true;
            try {
              const payload = await privateRequest("effectif-transfers/case", {
                method:"POST",
                body:JSON.stringify({type:"arrival", name:item.name, sourceCaseId:item.id, nextAction:"Préparer l’arrivée issue du prospect validé.", source:item.source}),
              });
              item.linkedArrivalCaseId = payload.case.id;
              state.cases = [payload.case, ...(state.cases || []).filter(existing => existing.id !== payload.case.id)];
              showFeedback(`${item.name} · dossier d’arrivée lié créé.`, "success");
              renderCurrentView();
            } catch (error) {
              showFeedback(humanError(error.message), "error");
              convert.disabled = false;
            }
          });
          conversion.append(make("p", "", "Décision humaine requise avant la conversion."), convert);
        }
        card.append(conversion);
      }
      grid.append(card);
    });
    content.append(grid);
  }

  function renderHistory(content) {
    content.append(sectionHeading("◷ TRAÇABILITÉ", "Dernières mises à jour", "Le journal technique complet reste dans le service privé"));
    const statusItems = (state.statuses || []).map(item => ({
      date:item.updatedAt,
      icon:STATUS[item.status]?.icon || "?",
      title:item.playerName,
      description:`État : ${STATUS[item.status]?.label || item.status} · ${SOURCE[item.source] || item.source}`,
    }));
    const caseItems = (state.cases || []).map(item => ({
      date:item.updatedAt,
      icon:CASES[item.type]?.icon || "•",
      title:item.name,
      description:`${CASES[item.type]?.label || item.type} · ${STEP_LABELS[item.step] || item.step}`,
    }));
    const items = [...statusItems, ...caseItems].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
    if (!items.length) {
      content.append(emptyState("◷", "Aucune mise à jour", "Les actions effectuées dans cet espace apparaîtront ici."));
      return;
    }
    const timeline = make("ol", "ew-timeline");
    items.forEach(item => {
      const row = make("li");
      const icon = make("span", "", item.icon);
      icon.setAttribute("aria-hidden", "true");
      const copy = make("div");
      copy.append(make("h3", "", item.title), make("p", "", item.description), make("small", "", formatDate(item.date, true)));
      row.append(icon, copy);
      timeline.append(row);
    });
    content.append(timeline);
  }

  function renderView(workspace) {
    const content = workspace.querySelector(".ew-content");
    if (!content) return;
    content.replaceChildren();
    if (loading) return loadingState(content);
    if (!dataReady) {
      const retry = emptyState("⚙", "Registre privé à connecter", "L’interface est prête, mais elle attend la publication de son service de données sécurisé.");
      const button = make("button", "ew-button-primary", "Réessayer la connexion");
      button.type = "button";
      button.addEventListener("click", () => loadData({announce:true}));
      retry.append(button);
      content.append(retry);
      return;
    }
    if (activeView === "squad") renderSquad(content);
    else if (activeView === "history") renderHistory(content);
    else renderCases(content, activeView);
  }

  function renderCurrentView() {
    const workspace = document.getElementById("effectif-workspace");
    if (workspace && opened) renderView(workspace);
  }

  function openWorkspace() {
    if (!authenticated) return;
    opened = true;
    const workspace = createWorkspace();
    if (!workspace) return;
    workspace.hidden = false;
    document.body.classList.add("effectif-workspace-open");
    installNavigation();
    updateUrl(true);
    if (!dataReady && !loading) loadData();
  }

  function closeWorkspace() {
    opened = false;
    document.body.classList.remove("effectif-workspace-open");
    const workspace = document.getElementById("effectif-workspace");
    if (workspace) workspace.hidden = true;
    const button = document.getElementById("effectif-workspace-button");
    button?.setAttribute("aria-pressed", "false");
    updateUrl(false);
    button?.focus();
  }

  window.addEventListener(SESSION_EVENT, event => {
    const token = typeof event.detail?.token === "string" ? event.detail.token : "";
    if (!token) return clearWorkspace();
    sessionToken = token;
    authenticated = true;
    installNavigation();
    if (requestedByUrl()) openWorkspace();
  });

  window.addEventListener("popstate", () => {
    if (!authenticated) return;
    if (requestedByUrl()) openWorkspace(); else closeWorkspace();
  });

  new MutationObserver(() => {
    if (!authenticated || observerQueued) return;
    observerQueued = true;
    requestAnimationFrame(() => {
      observerQueued = false;
      installNavigation();
      if (opened) {
        const workspace = createWorkspace();
        if (workspace) workspace.hidden = false;
        document.body.classList.add("effectif-workspace-open");
      }
    });
  }).observe(document.documentElement, {childList:true, subtree:true});
})();
