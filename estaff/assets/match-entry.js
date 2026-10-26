(() => {
  "use strict";

  const MATCH_ASSET_BASE = new URL(".",document.currentScript?.src || window.location.href).href;
  const API = "https://lykos-estaff-service.lykosfutsalclub.workers.dev/api/estaff";
  let heicConverterPromise = null;
  const state = {
    mode:"pre", prematch:null, prematchLoading:false, prematchError:"", prematchSelectedId:"", prematchSaving:false, prematchSaveError:"", prematchSaved:false,
    coaching:null, coachingLoading:false, coachingError:"", coachingSaving:false, coachingSaved:false, objectiveSaving:"", objectiveError:"", objectiveSaved:"", planFilter:"all", trainingSelectedId:"",
    token:"", loading:false, error:"", data:null, selectedId:"", scanStatus:"", scanError:"",
    preview:"", proposal:null, form:null, submitting:false, result:null, lastFile:null,
  };

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[character]));
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const notify = () => window.dispatchEvent(new CustomEvent("lykos:match-entry-updated"));

  function message(error, step = "") {
    const stepLabels = {
      score:"du score et des buts contre son camp",
      goals:"des buts et des passes décisives",
      playerRatings:"des notes des joueurs",
      matchRating:"de la note du match",
      mvp:"du vote de l’homme du match",
    };
    const messages = {
      sporteasy_authentication_failed:"La connexion SportEasy doit être renouvelée.",
      no_recent_match:"Aucun match récent n’a été trouvé dans SportEasy.",
      match_context_unavailable:"Les informations du match sont momentanément indisponibles.",
      match_photo_reader_unavailable:"La lecture de photo n’est pas disponible. La saisie manuelle reste possible.",
      match_photo_read_failed:"La photo n’a pas pu être lue. Recadrez-la ou saisissez les informations manuellement.",
      match_photo_response_invalid:"L’IA a lu la photo, mais son relevé est resté incomplet après deux tentatives. Vous pouvez relancer la lecture ou saisir les valeurs manuellement.",
      match_photo_service_unavailable:"Le service de lecture d’image n’a pas répondu après deux tentatives. Réessayez dans un instant ; votre photo reste prête.",
      match_changed_since_review:"La fiche SportEasy a changé pendant votre saisie. Rechargez-la avant de valider.",
      match_goals_score_mismatch:"Le total des buts des joueurs et des buts contre son camp doit être égal au score du Lykos.",
      incomplete_player_ratings:"Tous les joueurs proposés doivent avoir une note sur 10.",
      match_rating_already_submitted:"La note de ce match a déjà été envoyée depuis ce compte SportEasy.",
      match_update_failed:"La mise à jour SportEasy n’a pas pu être terminée.",
      sporteasy_update_failed:stepLabels[step]
        ? `SportEasy a refusé la mise à jour ${stepLabels[step]}. Vos autres informations restent protégées et pourront reprendre sans doublon.`
        : "SportEasy a refusé une étape de la mise à jour. Vos informations restent protégées et pourront reprendre sans doublon.",
      no_upcoming_match:"Aucun match à préparer n’a été trouvé dans SportEasy.",
      prematch_context_unavailable:"La préparation du prochain match est momentanément indisponible.",
      invalid_manual_roster_players:"Sélectionnez au moins 5 joueurs du groupe Lykos FC.",
      manual_roster_update_failed:"Le groupe n’a pas pu être enregistré. Réessayez dans un instant.",
      coaching_context_unavailable:"L’espace coaching est momentanément indisponible.",
      invalid_coaching_observation:"Complétez le constat, sa catégorie et son niveau d’importance.",
      invalid_training_objective:"Complétez l’objectif d’entraînement et son thème.",
      invalid_training_objective_assessment:"Choisissez une note de réalisation entre 1 et 5.",
      training_objective_not_found:"Cet objectif n’est plus disponible. Rechargez l’espace Entraînement.",
    };
    return messages[error] || "L’opération n’a pas pu être terminée.";
  }

  async function call(path, options = {}) {
    const response = await fetch(`${API}/${path}`, {
      credentials:"omit", cache:"no-store", ...options,
      headers:{Authorization:`Bearer ${state.token}`,...(options.headers || {})},
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(message(payload.error,payload.step));
      error.code = payload.error;
      throw error;
    }
    return payload;
  }

  function freshForm(match) {
    return {
      scoreLykos:match.score.lykos ?? "",
      scoreOpponent:match.score.opponent ?? "",
      ownGoals:match.ownGoals || 0,
      goals:Object.fromEntries(match.players.map(player => [player.id, player.goals || 0])),
      assists:Object.fromEntries(match.players.map(player => [player.id, player.assists || 0])),
      ratings:{},
      matchRating:0,
      mvpProfileId:"",
      confirmed:false,
    };
  }

  async function load(eventId = "") {
    if (!state.token || state.loading) return;
    state.loading = true; state.error = ""; state.result = null; notify();
    try {
      const suffix = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
      state.data = await call(`match-entry/context${suffix}`);
      state.selectedId = state.data.match.id;
      state.form = freshForm(state.data.match);
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false; notify();
    }
  }

  async function loadPrematch(eventId = "") {
    if (!state.token || state.prematchLoading) return;
    state.prematchLoading = true; state.prematchError = ""; notify();
    try {
      const suffix = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
      state.prematch = await call(`prematch/context${suffix}`);
      state.prematchSelectedId = state.prematch.match.id;
      state.prematchSaveError = "";
    } catch (error) {
      state.prematchError = error.message;
    } finally {
      state.prematchLoading = false; notify();
    }
  }

  async function loadCoaching() {
    if (!state.token || state.coachingLoading) return;
    state.coachingLoading=true; state.coachingError=""; notify();
    try {state.coaching=await call("coaching/context");}
    catch (error) {state.coachingError=error.message;}
    finally {state.coachingLoading=false;notify();}
  }

  function ensureLoaded() {
    if (!state.token) {
      const sharedSession = window.LYKOS_HUB_ACCESS?.getSession?.();
      if (typeof sharedSession?.token === "string") state.token = sharedSession.token;
    }
    if (state.mode === "pre" && state.token && !state.prematchLoading && !state.prematch && !state.prematchError) loadPrematch();
    if (state.mode === "post" && state.token && !state.loading && !state.data && !state.error) load();
    if (state.token && !state.coachingLoading && !state.coaching && !state.coachingError) loadCoaching();
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date inconnue" : new Intl.DateTimeFormat("fr-FR", {dateStyle:"full", timeStyle:"short", timeZone:"Europe/Paris"}).format(date);
  }

  function formatDay(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date inconnue" : new Intl.DateTimeFormat("fr-FR", {day:"2-digit",month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(date);
  }

  function workspaceTabs() {
    return `<div class="match-workspace-tabs" role="tablist" aria-label="Espace Jeu du Lykos FC">
      <button type="button" id="match-tab-pre" role="tab" aria-controls="match-panel-pre" aria-selected="${state.mode === "pre"}" tabindex="${state.mode === "pre" ? "0" : "-1"}" data-match-mode="pre">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 4 7v5c0 5 3.4 8.2 8 9 4.6-.8 8-4 8-9V7l-8-4Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg><span>Avant Match</span><small>Préparer la rencontre</small>
      </button>
      <button type="button" id="match-tab-post" role="tab" aria-controls="match-panel-post" aria-selected="${state.mode === "post"}" tabindex="${state.mode === "post" ? "0" : "-1"}" data-match-mode="post">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg><span>Après Match</span><small>Bilan et statistiques</small>
      </button>
      <button type="button" id="match-tab-training" role="tab" aria-controls="match-panel-training" aria-selected="${state.mode === "training"}" tabindex="${state.mode === "training" ? "0" : "-1"}" data-match-mode="training">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M6 3v6m12-6v6M5 11h14v10H5z"/><path d="m9 16 2 2 4-4"/></svg><span>Entraînement</span><small>Historique et suivi</small>
      </button>
      <button type="button" id="match-tab-gameplan" role="tab" aria-controls="match-panel-gameplan" aria-selected="${state.mode === "gameplan"}" tabindex="${state.mode === "gameplan" ? "0" : "-1"}" data-match-mode="gameplan">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 4h16v16H4zM12 4v16M4 12h16"/><circle cx="12" cy="12" r="2.5"/></svg><span>Plan de jeu</span><small>Principes des coachs</small>
      </button>
    </div>`;
  }

  function fixtureSummary(match, emptyText) {
    if (!match) return `<div class="prematch-history-empty"><strong>${escapeHtml(emptyText)}</strong><span>Le bloc se complètera dès qu’une rencontre correspondante sera disponible.</span></div>`;
    const result = window.LykosPrematchInsights?.resultLabel(match) || "Résultat";
    return `<div class="prematch-history-result"><div><strong>${escapeHtml(result)}</strong><span>${escapeHtml(formatDay(match.date))}</span></div><b>${escapeHtml(match.score || "—")}</b><p>Lykos FC — ${escapeHtml(match.opponent)}</p></div>`;
  }

  function fixtureSeries(matches, emptyText) {
    if (!matches?.length) return `<div class="prematch-history-empty"><strong>${escapeHtml(emptyText)}</strong><span>Le bloc se complètera dès qu’une rencontre correspondante sera disponible.</span></div>`;
    return `<div class="prematch-series">${matches.map(match => `<div><time>${escapeHtml(formatDay(match.date))}</time><span>${escapeHtml(match.opponent)}</span><b>${escapeHtml(match.score || "—")}</b></div>`).join("")}</div>`;
  }

  function resultRatio(matches) {
    const result = window.LykosPrematchInsights?.resultBreakdown(matches);
    if (!result?.matches) return "";
    const winShare = result.wins/result.matches*100;
    const drawShare = result.draws/result.matches*100;
    return `<div class="prematch-ratio" aria-label="${result.wins} victoires, ${result.draws} matchs nuls et ${result.losses} défaites sur ${result.matches} matchs">
      <div class="prematch-ratio-chart" style="--wins:${winShare}%;--draws:${winShare+drawShare}%"><strong>${result.matches}</strong><span>match${result.matches > 1 ? "s" : ""}</span></div>
      <dl><div><dt><i class="is-win"></i>Victoires</dt><dd>${result.wins}</dd></div><div><dt><i class="is-draw"></i>Nuls</dt><dd>${result.draws}</dd></div><div><dt><i class="is-loss"></i>Défaites</dt><dd>${result.losses}</dd></div></dl>
    </div>`;
  }

  const GAME_PLAN = [
    {code:"01",phase:"identite",title:"Notre identité de jeu",summary:"Passer d’un ADN fondé sur la solidité défensive à une équipe entreprenante, capable de gérer le tempo et d’alterner patience et transition rapide.",cues:["Avoir le ballon plus que l’adversaire","Mettre en place nos phases de jeu et manier l’adversaire","Rester solides défensivement","Être polyvalents et moins prévisibles","Dispositifs tactiques : 1-2-1 et 2-2"]},
    {code:"02",phase:"effectif",title:"Qualités et contraintes de l’effectif",summary:"Le projet s’appuie sur les qualités réelles du groupe et cible précisément les éléments qui doivent progresser.",cues:["Qualités : rigueur défensive, agressivité et cohésion","Contraintes : manque de mouvement, jeu trop prévisible et régularité mentale","À améliorer : seconds ballons, endurance, blessures et QI futsal","Responsabilités essentielles : Gaby, Robin, Tommy et Alex"]},
    {code:"03",phase:"entrainement",title:"Ce que nous pouvons travailler",summary:"Les entraînements doivent agir directement sur les comportements qui rendent le jeu du Lykos plus mobile et moins prévisible.",cues:["Les déplacements","Les ressorties de balle","La possession","Créer le déséquilibre","Casser des lignes par la passe","Utiliser le mur","Les principes classiques du Five"]},
    {code:"04",phase:"organisation",title:"Organisation collective",summary:"Le 2-2 est le dispositif de référence sans ballon. Le 1-2-1 est privilégié avec ballon, tout en gardant la capacité de varier.",cues:["2-2 sans ballon","1-2-1 avec ballon","Varier les dispositifs pour rester moins prévisibles"]},
    {code:"05",phase:"roles",title:"Rôles dans le 1-2-1",summary:"Chaque ligne possède des responsabilités identifiées, avec une exigence commune de polyvalence et de rigueur défensive.",cues:["Pointe basse : couverture, relance, interceptions, vision de jeu et QI","Ailiers : volume, adaptabilité, polyvalence, création, finition et rigueur défensive","Pivot : technique, finition, déplacements, flair, QI, replacement, création et rigueur défensive"]},
    {code:"06",phase:"roles",title:"Rôles dans le 2-2",summary:"Le 2-2 répartit la relance et la projection sur les défenseurs, tandis que les attaquants doivent finir, se replacer et compenser.",cues:["Défenseurs : rigueur, projection, relance, vision, passes cassant les lignes, volume, finition, agressivité et QI","Attaquants : finition, replacement, déplacements, volume, QI et compensation"]},
    {code:"07",phase:"avec_ballon",title:"Avec le ballon",summary:"Construire, progresser et finir en repartant court, au sol, aussi souvent que possible.",cues:["Avancer par l’axe grâce à la passe ou à la remise et aux déplacements","Pour avancer sur les côtés : écarter, se déplacer et dézoner","La pointe basse protège en 1-2-1","Le référent défense protège en 2-2"]},
    {code:"08",phase:"transition",title:"À la perte",summary:"La priorité est de reformer rapidement le bloc derrière le ballon et de protéger l’axe.",cues:["Se replacer derrière le ballon","Le joueur le plus proche freine la progression adverse","Les partenaires profitent de ce délai pour reformer le bloc","Protéger l’axe en priorité"]},
    {code:"09",phase:"zones",title:"Les quatre zones du terrain",summary:"Le comportement à la récupération dépend de la zone dans laquelle le ballon est gagné.",cues:["Zone de risque : devant nos buts","Zone de transition : avant la ligne médiane","Zone d’appui : avant la surface adverse","Zone de finition : dernier quart de terrain"]},
    {code:"10",phase:"transition",title:"À la récupération",summary:"Accélérer depuis la zone de transition ; conserver et se réorganiser depuis la zone de risque.",cues:["Le pivot propose une solution proche dans l’axe","La pointe basse assure la protection de l’axe","Les ailiers ou le deuxième attaquant courent vers l’avant"]},
    {code:"11",phase:"sans_ballon",title:"Sans ballon",summary:"Le bloc doit rester médian ou bas, compact, capable de coulisser et de conduire l’adversaire vers les côtés.",cues:["Fermer l’axe","Orienter l’adversaire vers les côtés","Déclencher le pressing sur une mauvaise passe ou un contrôle raté","Garder un bloc compact qui coulisse"]},
    {code:"12",phase:"adaptation",title:"S’adapter au scénario du match",summary:"Le dispositif et la hauteur de jeu évoluent selon le score et l’organisation adverse, sans abandonner les principes communs.",cues:["Si nous menons : passer à deux défenseurs en 2-2","Si nous sommes menés : passer à une pointe basse","Sous pressing haut : ressortir court et bas avec le gardien, du mouvement et de l’application technique","Face à un bloc bas : être patients, placer la pointe basse dans la zone de transition et tirer depuis la zone d’appui","Toujours jouer au sol, se replacer à la perte et utiliser le gardien à la relance"]},
    {code:"13",phase:"comportements",title:"Comportements et mise en pratique",summary:"Le projet demande un cadre positif, exigeant et observable pendant les entraînements comme pendant les matchs.",cues:["Encourager et retirer les paroles parasites","Maîtriser le langage non verbal","Réduire le nombre de touches de balle","Challenger dans les jeux","Faire réfléchir et questionner","Courir beaucoup, mais avec ballon","Signes observables : endurance, déplacements et plaisir"]},
  ];
  const PLAN_LABELS={all:"Tout",identite:"Identité",effectif:"Effectif",entrainement:"Entraînement",organisation:"Organisation",roles:"Rôles",avec_ballon:"Avec ballon",transition:"Transitions",zones:"4 zones",sans_ballon:"Sans ballon",adaptation:"Adaptations",comportements:"Comportements"};
  const CATEGORY_LABELS={avec_ballon:"Avec ballon",sans_ballon:"Sans ballon",transition:"Transition",mental:"Mental / émotions",physique:"Physique",collectif:"Collectif"};

  function importance(value) {
    const number=Math.max(1,Math.min(5,Number(value)||1));
    return `<span class="coaching-importance is-level-${number}" aria-label="Importance ${number} sur 5">${[1,2,3,4,5].map(level => `<i class="${level<=number?"is-filled":""}"></i>`).join("")}<b>${number}/5</b></span>`;
  }

  function analysisCards(limit=3) {
    const analyses=state.coaching?.analyses || [];
    if (!analyses.length) return `<div class="coaching-empty"><strong>Les prochains retours eSportif apparaîtront ici.</strong><span>L’absence de vidéo n’empêche plus Léonard de produire ses conclusions lorsqu’il dispose d’autres preuves fiables.</span></div>`;
    return `<div class="coaching-analysis-list">${analyses.slice(0,limit).map(item => `<article><span>${escapeHtml(item.agent === "leonard" ? "Léonard · eSportif" : "Nadir · Analyse")}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p><time>${escapeHtml(formatDay(item.occurredAt))}</time></article>`).join("")}</div>`;
  }

  function coachingAdvice(context) {
    const opponent=window.LykosPrematchInsights?.opponentDisplayName(context?.match?.opponent) || "l’adversaire";
    const history=window.LykosPrematchInsights?.history(context.match);
    const ratio=window.LykosPrematchInsights?.resultBreakdown(history?.againstMatches || []);
    const historyCue=ratio?.matches && ratio.wins < ratio.losses
      ? `Le passif face à ${opponent} impose d’abord de sécuriser l’axe et les pertes avant de chercher à accélérer.`
      : `Face à ${opponent}, conserver l’initiative sans déséquilibrer la sécurité derrière le ballon.`;
    return `<section class="prematch-card coaching-brief-card">
      <header><div><span class="coaching-kicker">COACHING</span><h2>Consignes et dynamique de jeu</h2><p>Le plan des coachs, le contexte du match et les derniers retours eSportif sont rapprochés automatiquement.</p></div></header>
      <div class="coaching-priorities"><article><b>1</b><div><h3>Installer la sortie courte</h3><p>Gardien impliqué, deux solutions visibles et passe de soutien autorisée si l’avant est fermé.</p></div></article><article><b>2</b><div><h3>Rester reliés en 1-2-1</h3><p>Largeur, intérieur, joueur haut et sécurité bougent ensemble autour du porteur.</p></div></article><article><b>3</b><div><h3>Protéger la perte</h3><p>${escapeHtml(historyCue)} Le plus proche ralentit ; les autres reforment le 2-2 et ferment l’intérieur.</p></div></article></div>
      <div class="coaching-esportif"><h3>Dernières orientations eSportif</h3>${analysisCards(2)}</div>
    </section>`;
  }

  function observationForm(scope,{eventId="",eventLabel="",occurredAt=""}={}) {
    const title=scope === "training" ? "Constat de séance" : "Constat de fin de match";
    return `<form class="coaching-form" data-coaching-form data-coaching-scope="${scope}">
      <input type="hidden" name="eventId" value="${escapeHtml(eventId)}"><input type="hidden" name="eventLabel" value="${escapeHtml(eventLabel)}"><input type="hidden" name="occurredAt" value="${escapeHtml(occurredAt)}">
      <div class="coaching-form-head"><div><h3>${title}</h3><p>Chaque point alimente les prochains Training Focus et briefs de match de Léonard.</p></div><span>Relié à eSportif</span></div>
      <label class="coaching-text"><span>Recommandation ou observation</span><textarea name="content" maxlength="600" required placeholder="Ex. Trop peu de solutions proches quand le porteur est bloqué le long de la paroi."></textarea></label>
      <div class="coaching-form-row"><label><span>Thème</span><select name="category">${Object.entries(CATEGORY_LABELS).map(([value,label]) => `<option value="${value}">${label}</option>`).join("")}</select></label><fieldset><legend>Importance</legend><div class="coaching-levels">${[1,2,3,4,5].map(level => `<label><input type="radio" name="importance" value="${level}" ${level===3?"checked":""}><span>${level}</span></label>`).join("")}</div></fieldset></div>
      ${state.coachingError ? `<p class="match-error" role="alert">${escapeHtml(state.coachingError)}</p>` : ""}${state.coachingSaved ? `<p class="coaching-saved" role="status">✓ Point enregistré et disponible pour eSportif.</p>` : ""}
      <button type="submit" class="company-primary" ${state.coachingSaving?"disabled":""}>${state.coachingSaving?"Enregistrement…":"Ajouter au suivi sportif"}</button>
    </form>`;
  }

  function observationList(scope,eventId="") {
    const observations=(state.coaching?.observations || []).filter(item => item.scope === scope && (!eventId || !item.eventId || String(item.eventId) === String(eventId)));
    if (!observations.length) return `<div class="coaching-empty"><strong>Aucun constat enregistré</strong><span>Le premier point saisi créera le fil de suivi de ce rendez-vous.</span></div>`;
    return `<div class="coaching-observation-list">${observations.map(item => `<article><div><span>${escapeHtml(CATEGORY_LABELS[item.category] || item.category)}</span>${importance(item.importance)}</div><p>${escapeHtml(item.content)}</p><footer><time>${escapeHtml(formatDay(item.occurredAt || item.createdAt))}</time><b>eSportif · Léonard</b></footer></article>`).join("")}</div>`;
  }

  function objectiveForm(training) {
    if (!training) return `<div class="coaching-empty"><strong>Aucune séance sélectionnée</strong><span>Choisissez une séance avant de fixer ses objectifs.</span></div>`;
    return `<form class="training-objective-form" data-training-objective-form>
      <input type="hidden" name="trainingId" value="${escapeHtml(training.id)}"><input type="hidden" name="trainingLabel" value="${escapeHtml(training.label)}"><input type="hidden" name="plannedFor" value="${escapeHtml(training.startAt)}">
      <div class="coaching-form-head"><div><h3>Objectifs de la séance</h3><p>Définissez ce que le groupe doit réellement réussir, avant de l’évaluer après la séance.</p></div><span>Suivi eSportif</span></div>
      <label class="coaching-text"><span>Objectif à atteindre</span><textarea name="content" maxlength="600" required placeholder="Ex. Créer deux solutions proches autour du porteur en sortie de zone basse."></textarea></label>
      <label class="objective-theme"><span>Thème</span><select name="category">${Object.entries(CATEGORY_LABELS).map(([value,label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
      ${state.objectiveError ? `<p class="match-error" role="alert">${escapeHtml(state.objectiveError)}</p>` : ""}${state.objectiveSaved === "created" ? `<p class="coaching-saved" role="status">✓ Objectif ajouté à la séance et transmis à eSportif.</p>` : ""}
      <button type="submit" class="company-primary" ${state.objectiveSaving==="new"?"disabled":""}>${state.objectiveSaving==="new"?"Enregistrement…":"Ajouter l’objectif"}</button>
    </form>`;
  }

  function objectiveOutcome(item) {
    if (item.status === "acquired") return {label:"Atteint",className:"is-achieved",detail:"Cet objectif peut être considéré comme acquis."};
    if (item.outcome === "partially_achieved") return {label:"Partiellement atteint",className:"is-partial",detail:"Il reste automatiquement dans les priorités."};
    if (item.outcome === "not_achieved") return {label:"Non atteint",className:"is-missed",detail:"Il reste automatiquement dans les priorités."};
    return {label:"À évaluer",className:"is-pending",detail:"La séance ne validera rien tant que l’objectif n’est pas évalué."};
  }

  function objectiveList(training) {
    const all=state.coaching?.objectives || [];
    const currentId=String(training?.id || "");
    const current=all.filter(item => currentId && String(item.trainingId) === currentId);
    const carried=all.filter(item => item.status !== "acquired" && (!currentId || String(item.trainingId) !== currentId));
    const objectives=[...current,...carried];
    if (!objectives.length) return `<div class="coaching-empty"><strong>Aucun objectif actif</strong><span>Ajoutez le premier objectif de la séance pour pouvoir mesurer son acquisition.</span></div>`;
    return `<div class="training-objective-list">${objectives.map(item => {
      const outcome=objectiveOutcome(item);
      const assessments=item.assessments || [];
      const assessment=assessments.length ? assessments[assessments.length-1] : null;
      const carriedOver=currentId && String(item.trainingId) !== currentId;
      return `<article class="training-objective ${outcome.className}">
        <header><div><span>${escapeHtml(CATEGORY_LABELS[item.category] || item.category)}${carriedOver ? " · À reprendre" : ""}</span><h3>${escapeHtml(item.content)}</h3></div><b>${escapeHtml(outcome.label)}</b></header>
        <p class="objective-status-detail">${escapeHtml(outcome.detail)}</p>
        ${assessment ? `<div class="objective-last-score"><strong>${assessment.score}/5</strong><span>${assessment.note ? escapeHtml(assessment.note) : "Dernière évaluation enregistrée"}</span><time>${escapeHtml(formatDay(assessment.assessedAt))}</time></div>` : ""}
        ${item.status === "acquired" ? "" : `<form data-objective-assessment-form data-objective-id="${escapeHtml(item.id)}">
          <fieldset><legend>Objectif atteint ?</legend><div class="objective-score">${[1,2,3,4,5].map(score => `<label><input type="radio" name="score" value="${score}" ${Number(item.lastScore)===score?"checked":""} required><span>${score}</span></label>`).join("")}</div><div class="objective-scale"><span>Pas atteint</span><span>Maîtrisé</span></div></fieldset>
          <label class="objective-note"><span>Constat après la séance <small>facultatif</small></span><input name="note" maxlength="600" placeholder="Ce qui a fonctionné ou doit être repris"></label>
          ${state.objectiveSaved === item.id ? `<p class="coaching-saved" role="status">✓ Évaluation enregistrée. La priorité a été recalculée.</p>` : ""}
          <button type="submit" class="company-primary" ${state.objectiveSaving===item.id?"disabled":""}>${state.objectiveSaving===item.id?"Évaluation…":"Enregistrer l’évaluation"}</button>
        </form>`}
      </article>`;
    }).join("")}</div>`;
  }

  function playerWindow(window, opponent = false) {
    if (!window?.windowMatches) return `<span class="prematch-player-empty">Aucun match de référence</span>`;
    if (!window.matches) return `<span class="prematch-player-empty">${opponent ? "Jamais aligné contre cet adversaire" : "Absent des cinq derniers matchs"}</span>`;
    const rating = window.averageRating === null ? "Note —" : `Note ${window.averageRating}/10`;
    return `<span>${rating}</span><span>${window.goals} B · ${window.assists} PD</span><span>${window.contributionsPerMatch} déc./match · ${window.matches}/${window.windowMatches} prés.</span>`;
  }

  function preMatchView() {
    const context = state.prematch;
    const insights = window.LykosPrematchInsights;
    if (!context || !insights) return "";
    const prediction = insights.forecast(context);
    const history = insights.history(context.match);
    const opponent = insights.opponentDisplayName(context.match.opponent);
    const roster = prediction.squad;
    const manuallyValidated = context.roster.confirmation === "manual";
    const confirmed = manuallyValidated || context.roster.confirmation === "confirmed";
    const statusText = manuallyValidated ? "Groupe validé dans le Performance Hub" : confirmed ? "Groupe confirmé par la convocation Messenger" : context.roster.confirmation === "sporteasy_only" ? "Groupe provisoire issu de SportEasy" : "Groupe à valider";
    const statusDetail = confirmed
      ? `${context.roster.author ? `Message de ${context.roster.author} · ` : "Validation humaine · "}${formatDate(context.roster.confirmedAt)}`
      : "La prévision se mettra à jour automatiquement après confirmation du groupe Lykos FC.";
    const selectablePlayers = context.availablePlayers || [];
    const selectedIds = new Set(context.roster.players.map(player => String(player.id || "")).filter(Boolean));
    const selectedNames = new Set(context.roster.players.map(player => normalize(player.name)).filter(Boolean));
    const isSelectedPlayer = player => selectedIds.has(String(player.id)) || selectedNames.has(normalize(player.name));
    const selectedCount = selectablePlayers.filter(isSelectedPlayer).length;
    const sourceRows = prediction.available ? [
      ["Metron du groupe",prediction.squad.average === null ? "—" : `${prediction.squad.average} / 99`,"25 %"],
      ["Forme collective",`${prediction.form} / 99`,"15 %"],
      ["5 face-à-face",prediction.headToHead.value === null ? "Sans historique" : `${prediction.headToHead.value} / 99`,prediction.headToHead.value === null ? "Redistribué" : "25 %"],
      ["Joueurs · forme récente",prediction.evidence.recentAverage === null ? "Sans données" : `${prediction.evidence.recentAverage} / 99`,prediction.evidence.recentAverage === null ? "Redistribué" : "15 %"],
      ["Joueurs · vs adversaire",prediction.evidence.opponentAverage === null ? "Sans données" : `${prediction.evidence.opponentAverage} / 99`,prediction.evidence.opponentAverage === null ? "Redistribué" : "20 %"],
    ] : [];
    return `<main class="company-main match-entry-main prematch-main">
      <section class="company-title prematch-title">
        <div><h1>Préparer le match</h1><span>Le prochain rendez-vous, le groupe retenu et les repères Metron réunis automatiquement.</span></div>
        <span class="prematch-auto"><i></i><b>Mise à jour automatique</b>SportEasy, Metron et convocation</span>
      </section>
      ${context.candidates?.length > 1 ? `<label class="prematch-select"><span>Rencontre préparée</span><select data-prematch-select>${context.candidates.map(candidate => `<option value="${candidate.id}" ${candidate.id===context.match.id?"selected":""}>${escapeHtml(insights.opponentDisplayName(candidate.opponent))} · ${escapeHtml(formatDate(candidate.startAt))}</option>`).join("")}</select></label>` : ""}
      <section class="prematch-opponent">
        <div><span>Prochaine rencontre</span><h2>Lykos FC <i>vs</i> ${escapeHtml(opponent)}</h2><p>${escapeHtml(formatDate(context.match.startAt))}${context.match.venue ? ` · ${escapeHtml(context.match.venue)}` : ""}</p></div>
        <div class="prematch-roster-status ${confirmed ? "is-confirmed" : "is-pending"}"><i aria-hidden="true"></i><div><strong>${escapeHtml(statusText)}</strong><span>${escapeHtml(statusDetail)}</span></div></div>
      </section>
      <div class="prematch-grid">
        ${coachingAdvice(context)}
        <section class="prematch-card prematch-squad">
          <header><div><h2>Groupe retenu</h2><p>${roster.players.length} joueur${roster.players.length > 1 ? "s" : ""} · ${roster.coverage.available}/${roster.coverage.total} Metron disponibles</p></div><strong>${roster.average === null ? "—" : roster.average}<small>/99</small><span>Moyenne</span></strong></header>
          <form class="prematch-roster-editor" data-prematch-roster-form>
            <div class="prematch-roster-editor-title"><div><strong>Valider le groupe convoqué</strong><span>Sélectionnez les joueurs retenus. Votre choix remplace automatiquement le groupe provisoire.</span></div><b data-prematch-roster-count>${selectedCount} sélectionné${selectedCount > 1 ? "s" : ""}</b></div>
            <div class="prematch-roster-options">${selectablePlayers.map(player => `<label><input type="checkbox" name="playerIds" value="${escapeHtml(player.id)}" ${isSelectedPlayer(player) ? "checked" : ""}><span><i aria-hidden="true">✓</i>${escapeHtml(player.name)}</span></label>`).join("")}</div>
            ${state.prematchSaveError ? `<p class="match-error" role="alert">${escapeHtml(state.prematchSaveError)}</p>` : ""}
            ${state.prematchSaved ? `<p class="prematch-roster-saved" role="status">✓ Groupe convoqué validé et pronostic recalculé.</p>` : ""}
            <button type="submit" class="company-primary prematch-roster-submit" ${state.prematchSaving || selectablePlayers.length < 5 ? "disabled" : ""}>${state.prematchSaving ? "Validation en cours…" : manuallyValidated ? "Mettre à jour le groupe" : "Valider le groupe convoqué"}</button>
          </form>
          ${roster.players.length ? `<div class="prematch-player-list">${roster.players.map(player => `<article class="prematch-player"><header><strong>${escapeHtml(player.name)}</strong><b>${player.metron === null ? "Metron non calculable" : `Metron ${player.metron} / 99`}</b></header><div><small>5 derniers matchs</small>${playerWindow(player.recent)}</div><div><small>5 derniers face-à-face</small>${playerWindow(player.opponent,true)}</div></article>`).join("")}</div>` : `<div class="prematch-history-empty"><strong>Groupe non disponible</strong><span>SportEasy et la convocation Messenger sont surveillés automatiquement.</span></div>`}
        </section>
        <section class="prematch-card prematch-forecast">
          <header><div><h2>Pronostic Metron</h2><p>Une tendance, pas une promesse de résultat.</p></div></header>
          ${prediction.available ? `<div class="prematch-gauge" style="--prematch-score:${prediction.value}%"><strong>${prediction.value}<small>/99</small></strong><span>${escapeHtml(prediction.label)}</span></div><div class="prematch-components">${sourceRows.map(([label,value,weight]) => `<div><span>${label}</span><b>${value}</b><small>${weight}</small></div>`).join("")}</div><p class="prematch-confidence">Confiance ${prediction.confidence}${prediction.provisional ? " · groupe encore provisoire" : " · groupe confirmé"}</p>` : `<div class="prematch-history-empty"><strong>Pronostic en attente</strong><span>${escapeHtml(prediction.reason)}</span></div>`}
        </section>
        <section class="prematch-card prematch-history prematch-last-history">
          <header><div><h2>Dernier match du Lykos</h2><p>Le repère de forme le plus récent.</p></div></header>
          ${fixtureSummary(history.lastMatch,"Aucun match précédent disponible")}
          ${resultRatio(history.recentMatches)}
        </section>
        <section class="prematch-card prematch-history prematch-opponent-history">
          <header><div><h2>5 derniers matchs contre ${escapeHtml(opponent)}</h2><p>Les variantes connues du nom adverse sont regroupées.</p></div></header>
          ${resultRatio(history.againstMatches)}
          ${fixtureSeries(history.againstMatches,"Aucun face-à-face retrouvé")}
        </section>
      </div>
    </main>`;
  }

  function stars(value) {
    const icon = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 2.4 2.86 5.8 6.4.93-4.63 4.51 1.1 6.38L12 17l-5.73 3.02 1.1-6.38-4.63-4.51 6.4-.93L12 2.4Z"/></svg>`;
    return `<div class="match-stars" role="radiogroup" aria-label="Note du match sur 6">${[1,2,3,4,5,6].map(number => `<button type="button" data-match-star="${number}" role="radio" aria-label="${number} étoile${number>1?"s":""}" aria-checked="${value===number}" class="${value>=number?"is-selected":""}">${icon}</button>`).join("")}</div><p class="match-star-value" aria-live="polite">${value?`${value} étoile${value>1?"s":""} sélectionnée${value>1?"s":""}`:"Survolez puis cliquez pour choisir"}</p>`;
  }

  function ratingColor(value) {
    if (value <= 2) return "#ef4444";
    if (value <= 4) return "#f97316";
    if (value <= 6) return "#facc15";
    if (value <= 8) return "#84cc16";
    return "#22c55e";
  }

  function playerRows(match, form) {
    return match.players.map(player => {
      const eligible = player.ratingEligible;
      return `<article class="match-player-row">
        <span class="match-player-initial">${escapeHtml((player.firstName || player.name || "?").slice(0,1).toUpperCase())}</span>
        <div><strong>${escapeHtml(player.name)}</strong><small>${player.played?"A participé au match":"Statistiques disponibles"}</small></div>
        <label><span>Buts</span><input type="number" min="0" max="40" inputmode="numeric" name="goal-${player.id}" value="${escapeHtml(form.goals[player.id] ?? 0)}"></label>
        <label><span>Passes D.</span><input type="number" min="0" max="40" inputmode="numeric" name="assist-${player.id}" value="${escapeHtml(form.assists[player.id] ?? 0)}" aria-label="Passes décisives de ${escapeHtml(player.name)}"></label>
        ${eligible ? `<label class="match-player-rating"><span>Note sur 10</span><div class="match-rating-control"><input type="range" min="1" max="10" step="1" value="${escapeHtml(form.ratings[player.id] || 5)}" data-match-rating="${player.id}" aria-label="Note de ${escapeHtml(player.name)} sur 10" style="--match-rating-pct:${form.ratings[player.id]?((Number(form.ratings[player.id])-1)/9)*100:44.44}%;--match-rating-color:${ratingColor(Number(form.ratings[player.id] || 5))}"><output data-match-rating-output="${player.id}" style="--match-rating-color:${ratingColor(Number(form.ratings[player.id] || 5))}">${escapeHtml(form.ratings[player.id] || "—")}</output><input type="hidden" name="rating-${player.id}" value="${escapeHtml(form.ratings[player.id] ?? "")}"></div></label>` : `<span class="match-rating-state">${player.ratingLocked?"Note déjà envoyée":player.played?"Votre propre fiche":"Non noté"}</span>`}
      </article>`;
    }).join("");
  }

  function mvpSelector(match, form) {
    const players = match.players.filter(player => player.mvpEligible);
    if (!players.length) return `<p class="match-rating-state">Aucun joueur éligible pour ce vote.</p>`;
    return `<div class="match-mvp" role="radiogroup" aria-label="Homme du match">${players.map(player => {
      const selected = String(form.mvpProfileId) === String(player.id);
      const avatar = player.avatar ? `<img src="${escapeHtml(player.avatar)}" alt="">` : `<span>${escapeHtml((player.firstName || player.name || "?").slice(0,1).toUpperCase())}</span>`;
      return `<button type="button" data-match-mvp="${player.id}" role="radio" aria-checked="${selected}" class="${selected?"is-selected":""}">${avatar}<b>${escapeHtml(player.name)}</b><i aria-hidden="true">✓</i></button>`;
    }).join("")}</div>${form.mvpProfileId?`<button type="button" class="match-mvp-clear" data-match-mvp-clear>Ne pas désigner d’homme du match</button>`:""}`;
  }

  function warnings() {
    const proposal = state.proposal;
    if (!proposal) return "";
    const items = [...(proposal.warnings || [])];
    if (proposal.confidence !== "high") items.unshift("La lecture automatique est incertaine : contrôlez chaque valeur.");
    return items.length ? `<div class="match-warning"><strong>Points à contrôler</strong><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : `<p class="match-ok">✓ Lecture nette. Un contrôle humain reste obligatoire.</p>`;
  }

  function matchIsComplete(match) {
    return Boolean(
      match?.matchRatingLocked
      && match?.mvpVoteLocked
      && !match.players?.some(player => player.ratingEligible)
    );
  }

  function emptyView() {
    return `<main class="company-main match-entry-main">
      <section class="company-title match-title">
        <div><h1>Saisie match</h1><span>Transformez la feuille du banc en statistiques SportEasy contrôlées.</span></div>
      </section>
      <div class="match-empty" role="status">
        <strong>Aucun match à saisir en attente</strong>
      </div>
    </main>`;
  }

  function readyView() {
    const match = state.data.match;
    if (matchIsComplete(match)) return emptyView();
    const form = state.form || freshForm(match);
    const eligible = match.players.filter(player => player.ratingEligible);
    return `<main class="company-main match-entry-main">
      <section class="company-title match-title">
        <div><h1>Saisie match</h1><span>Transformez la feuille du banc en statistiques SportEasy contrôlées.</span></div>
        <span class="match-safety"><i></i><b>Validation humaine</b>Aucune publication automatique</span>
      </section>
      <nav class="match-progress" aria-label="Parcours de saisie"><button type="button" data-match-step-target="match-step-context"><b>1</b><span class="match-step-label" data-short="Rencontre">Rencontre</span></button><button type="button" data-match-step-target="match-step-photo"><b>2</b><span class="match-step-label" data-short="Photo">Photo</span></button><button type="button" data-match-step-target="match-step-stats"><b>3</b><span class="match-step-label" data-short="Stats">Statistiques</span></button><button type="button" data-match-step-target="match-step-rating"><b>4</b><span class="match-step-label" data-short="Note">Note</span></button><button type="button" data-match-step-target="match-step-submit"><b>5</b><span class="match-step-label" data-short="Envoi">Envoi</span></button></nav>
      <form data-match-form class="match-workflow">
        <section class="match-card match-context" id="match-step-context">
          <header><span>1</span><div><h2>La rencontre</h2></div></header>
          <label class="match-select"><span>Rencontre à compléter</span><select data-match-select>${state.data.candidates.map(candidate => `<option value="${candidate.id}" ${candidate.id===match.id?"selected":""}>${escapeHtml(candidate.opponent)} · ${escapeHtml(formatDate(candidate.startAt))}</option>`).join("")}</select></label>
          <div class="match-selected"><span class="match-club">LYKOS FC</span><i>VS</i><span class="match-opponent">${escapeHtml(match.opponent)}</span><time>${escapeHtml(formatDate(match.startAt))}</time></div>
        </section>

        <section class="match-card match-photo" id="match-step-photo">
          <header><span>2</span><div><h2>Photographier ou importer</h2></div></header>
          <label class="match-drop ${state.preview?"has-preview":""}">
            ${state.preview?`<img src="${state.preview}" alt="Aperçu de la feuille de match">`:`<span class="match-camera-icon" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M8 20.5h10l4.8-7h18.4l4.8 7h10a4 4 0 0 1 4 4v25a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-25a4 4 0 0 1 4-4Z"/><circle cx="32" cy="37" r="11"/><path d="M50 15.5h6M53 12.5v6"/></svg></span><strong>Ajouter la feuille de match</strong><small>Photo nette, cadrée à plat, avec les noms et les buts visibles.</small><em>Galerie ou appareil photo</em>`}
            <input type="file" data-match-photo accept="image/*,.heic,.heif">
          </label>
          <p class="match-privacy">🔒 La photo est transmise de façon temporaire pour être lue, puis n’est pas conservée. Vous pouvez aussi tout saisir à la main.</p>
          ${state.scanStatus==="loading"?`<p class="match-processing"><i></i>Lecture de la feuille en cours…</p>`:""}
          ${state.scanError?`<div class="match-scan-error"><p class="match-error" role="alert">${escapeHtml(state.scanError)}</p>${state.lastFile?`<button type="button" class="match-retry-scan" data-match-scan-retry>Réessayer la lecture</button>`:""}</div>`:""}
          ${warnings()}
        </section>

        <section class="match-card match-score-card" id="match-step-stats">
          <header><span>3</span><div><h2>Score, buts, passes et notes</h2></div></header>
          <div class="match-score">
            <label><span>Lykos FC</span><input type="number" min="0" max="99" inputmode="numeric" name="scoreLykos" value="${escapeHtml(form.scoreLykos)}" required></label>
            <b>–</b>
            <label><span>${escapeHtml(match.opponent)}</span><input type="number" min="0" max="99" inputmode="numeric" name="scoreOpponent" value="${escapeHtml(form.scoreOpponent)}" required></label>
          </div>
          <label class="match-own-goals"><span>Buts du Lykos non attribués à un joueur (contre son camp)</span><input type="number" min="0" max="20" inputmode="numeric" name="ownGoals" value="${escapeHtml(form.ownGoals)}"></label>
          <div class="match-player-list">${playerRows(match,form)}</div>
        </section>

        <section class="match-card match-rating-card" id="match-step-rating">
          <header><span>4</span><div><h2>Appréciation du match</h2></div></header>
          <h3>Note du match</h3>
          ${match.matchRatingLocked?`<p class="match-warning">La note du match a déjà été envoyée depuis ce compte SportEasy.</p>`:stars(form.matchRating)}
          <div class="match-rating-divider"></div>
          <h3>Homme du match <span>Facultatif</span></h3>
          ${match.mvpVoteLocked?`<p class="match-warning">Le vote Homme du match n’est plus ouvert dans SportEasy.</p>`:mvpSelector(match,form)}
          <p>Les notes joueurs sur 10, la note du match et votre éventuel vote deviennent définitifs après l’envoi.</p>
        </section>

        <section class="match-card match-approval" id="match-step-submit">
          <header><span>5</span><div><h2>Approuver et envoyer</h2></div></header>
          <label class="match-confirm"><input type="checkbox" name="confirmed" ${form.confirmed?"checked":""} required><span>J’ai contrôlé le match, le score, tous les buteurs, toutes les passes décisives, toutes les notes et le choix de l’homme du match. J’autorise leur mise à jour immédiate dans SportEasy.</span></label>
          ${state.error?`<p class="match-error" role="alert">${escapeHtml(state.error)}</p>`:""}
          ${state.result?`<div class="match-success"><strong>✓ SportEasy est à jour</strong><span>Score, buts, passes décisives, notes et vote ont été enregistrés.</span></div>`:""}
          <button type="submit" class="company-primary match-submit" ${state.submitting||match.matchRatingLocked||!eligible.length?"disabled":""}>${state.submitting?"Synchronisation en cours…":"Approuver et mettre à jour SportEasy"}</button>
        </section>
      </form>
      <section class="match-card coaching-notebook">
        <header><div><span class="coaching-kicker">COACHING</span><h2>Constats et recommandations</h2><p>Hiérarchisez les enseignements du match pour orienter les entraînements et les prochains briefs.</p></div></header>
        <div class="coaching-notebook-grid"><div>${observationForm("post_match",{eventId:match.id,eventLabel:`Lykos FC — ${match.opponent}`,occurredAt:match.startAt})}</div><div><h3>Suivi de la rencontre</h3>${observationList("post_match",match.id)}</div></div>
      </section>
    </main>`;
  }

  function trainingView() {
    const trainings=state.coaching?.trainings || [];
    const current=trainings.find(item => String(item.id) === String(state.trainingSelectedId)) || trainings[0] || null;
    return `<main class="company-main match-entry-main coaching-main">
      <section class="company-title match-title"><div><h1>Entraînement</h1><span>Historique des séances, constats du terrain et continuité avec le projet sportif.</span></div><span class="prematch-auto"><i></i><b>Boucle eSportif</b>Constat → Training Focus → brief</span></section>
      <div class="training-layout">
        <section class="match-card training-history"><header><div><span class="coaching-kicker">HISTORIQUE</span><h2>Séances SportEasy</h2><p>Les entraînements sont classés automatiquement par date.</p></div></header>${trainings.length ? `<div class="training-timeline">${trainings.map(item => `<button type="button" class="${String(item.id)===String(current?.id)?"is-current":""}" data-training-id="${escapeHtml(item.id)}"><time>${escapeHtml(formatDay(item.startAt))}</time><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.venue || item.pitch || "Lieu non renseigné")}</span></button>`).join("")}</div>` : `<div class="coaching-empty"><strong>Aucune séance SportEasy retrouvée</strong><span>L’historique apparaîtra automatiquement dès que la source transmettra les entraînements.</span></div>`}</section>
        <section class="match-card training-objectives"><header><div><span class="coaching-kicker">OBJECTIFS MESURABLES</span><h2>${escapeHtml(current?.label || "Objectifs d’entraînement")}</h2><p>${current ? escapeHtml(formatDate(current.startAt)) : "Sélectionnez une séance pour fixer ses objectifs."}</p></div><strong class="objective-threshold">Acquis à partir de 4/5</strong></header><div class="training-objective-grid"><div>${objectiveForm(current)}</div><div><h3>Évaluation et priorités actives</h3>${objectiveList(current)}</div></div></section>
        <section class="match-card coaching-notebook"><header><div><span class="coaching-kicker">RETOUR TERRAIN</span><h2>Constats complémentaires</h2><p>Les observations restent distinctes des objectifs mesurés de la séance.</p></div></header><div class="coaching-notebook-grid"><div>${observationForm("training",{eventId:current?.id,eventLabel:current?.label,occurredAt:current?.startAt})}</div><div><h3>Points de travail</h3>${observationList("training",current?.id)}</div></div></section>
        <section class="match-card training-esportif"><header><div><span class="coaching-kicker">ESPORTIF</span><h2>Analyses qui orientent les séances</h2><p>Les rapports de Nadir et les conclusions de Léonard restent visibles au même endroit.</p></div></header>${analysisCards(6)}</section>
      </div>
    </main>`;
  }

  function gamePlanView() {
    const selected=state.planFilter || "all";
    const items=GAME_PLAN.filter(item => selected === "all" || item.phase === selected);
    return `<main class="company-main match-entry-main coaching-main game-plan-main">
      <section class="company-title match-title"><div><h1>Plan de jeu</h1><span>Le document officiel des coachs, structuré sans modifier son contenu sportif.</span></div><span class="prematch-auto"><i></i><b>Source officielle</b>Projet de jeu LYKOS 26/27 · Drive</span></section>
      <section class="game-plan-hero"><div><span>NOTRE IDENTITÉ DE JEU</span><h2>Entreprenants, solides et moins prévisibles.</h2><p>Nous voulons avoir le ballon plus que l’adversaire, gérer le tempo du match et alterner patience et transition rapide. Notre base reste la solidité défensive, avec le 1-2-1 et le 2-2 comme dispositifs tactiques.</p></div><aside><strong>Principes non négociables</strong><p>Avoir le ballon, rester solides défensivement et être polyvalents dans notre manière de jouer.</p></aside></section>
      <p class="game-plan-source">Source : document officiel « Projet de jeu LYKOS 26/27 », dernière mise à jour Drive du 5 septembre 2026.</p>
      <nav class="game-plan-filters" aria-label="Filtrer le plan de jeu">${Object.entries(PLAN_LABELS).map(([value,label]) => `<button type="button" data-plan-filter="${value}" class="${selected===value?"is-selected":""}" aria-pressed="${selected===value}">${label}</button>`).join("")}</nav>
      <section class="game-plan-grid">${items.map(item => `<article><header><span>${escapeHtml(item.code)}</span><em>${escapeHtml(PLAN_LABELS[item.phase] || item.phase)}</em></header><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p><ul>${item.cues.map(cue => `<li>${escapeHtml(cue)}</li>`).join("")}</ul></article>`).join("")}</section>
    </main>`;
  }

  function view() {
    ensureLoaded();
    let content = "";
    if (state.mode === "pre") {
      if (state.prematchLoading && !state.prematch) content = `<main class="company-main match-entry-main"><div class="match-loading"><i></i><strong>Préparation du prochain match…</strong></div></main>`;
      else if (state.prematchError && !state.prematch) content = `<main class="company-main match-entry-main"><div class="match-empty"><strong>${escapeHtml(state.prematchError)}</strong><button type="button" class="company-primary" data-prematch-retry>Réessayer</button></div></main>`;
      else content = state.prematch ? preMatchView() : `<main class="company-main match-entry-main"></main>`;
    } else if (state.mode === "post") {
      if (state.loading && !state.data) content = `<main class="company-main match-entry-main"><div class="match-loading"><i></i><strong>Connexion à SportEasy…</strong></div></main>`;
      else if (state.error && !state.data) content = `<main class="company-main match-entry-main"><div class="match-empty"><strong>${escapeHtml(state.error)}</strong><button type="button" class="company-primary" data-match-retry>Réessayer</button></div></main>`;
      else content = state.data ? readyView() : `<main class="company-main match-entry-main"></main>`;
    } else if (state.mode === "training") content=trainingView();
    else content=gamePlanView();
    const panelId = `match-panel-${state.mode}`;
    return `${workspaceTabs()}<section id="${panelId}" role="tabpanel" aria-labelledby="match-tab-${state.mode}">${content}</section>`;
  }

  function loadHeicConverter() {
    if (typeof window.heic2any === "function") return Promise.resolve(window.heic2any);
    if (heicConverterPromise) return heicConverterPromise;
    heicConverterPromise = new Promise((resolve,reject) => {
      const script = document.createElement("script");
      script.src = `${MATCH_ASSET_BASE}vendor/heic2any-0.0.4.min.js`;
      script.async = true;
      script.onload = () => typeof window.heic2any === "function" ? resolve(window.heic2any) : reject(new Error("Convertisseur HEIC indisponible."));
      script.onerror = () => reject(new Error("Convertisseur HEIC indisponible."));
      document.head.appendChild(script);
    });
    return heicConverterPromise;
  }

  async function browserImage(file) {
    const isHeic = /image\/(?:hei[cf])/i.test(file?.type || "") || /\.(?:hei[cf])$/i.test(file?.name || "");
    if (!isHeic) return file;
    try {
      const convert = await loadHeicConverter();
      const result = await convert({blob:file,toType:"image/jpeg",quality:.94});
      return Array.isArray(result) ? result[0] : result;
    } catch {
      throw new Error("La photo HEIC n’a pas pu être convertie. Réessayez ou choisissez une version JPEG.");
    }
  }

  async function readImage(file) {
    const source = await browserImage(file);
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          let maximum = 2400;
          let quality = .9;
          let encoded = "";
          for (let attempt = 0; attempt < 6; attempt += 1) {
            const scale = Math.min(1,maximum/Math.max(image.width,image.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1,Math.round(image.width*scale));
            canvas.height = Math.max(1,Math.round(image.height*scale));
            canvas.getContext("2d",{alpha:false}).drawImage(image,0,0,canvas.width,canvas.height);
            encoded = canvas.toDataURL("image/jpeg",quality);
            if (encoded.length <= 4_000_000) break;
            if (quality > .7) quality -= .08;
            else maximum = Math.round(maximum*.82);
          }
          resolve(encoded);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(source);
    });
  }

  function applyProposal(proposal) {
    const form = state.form;
    if (proposal.score.lykos !== null) form.scoreLykos = proposal.score.lykos;
    if (proposal.score.opponent !== null) form.scoreOpponent = proposal.score.opponent;
    form.ownGoals = proposal.ownGoals || 0;
    const unmatched = [];
    for (const goal of proposal.goals) {
      const query = normalize(goal.name);
      const candidates = state.data.match.players.filter(player => {
        const name = normalize(player.name);
        return name === query || name.includes(query) || query.includes(normalize(player.firstName));
      });
      if (candidates.length === 1) form.goals[candidates[0].id] = goal.count;
      else unmatched.push(`Buteur à identifier : ${goal.name} (${goal.count})`);
    }
    for (const assist of proposal.assists || []) {
      const query = normalize(assist.name);
      const candidates = state.data.match.players.filter(player => {
        const name = normalize(player.name);
        return name === query || name.includes(query) || query.includes(normalize(player.firstName));
      });
      if (candidates.length === 1) form.assists[candidates[0].id] = assist.count;
      else unmatched.push(`Passeur à identifier : ${assist.name} (${assist.count})`);
    }
    proposal.warnings = [...(proposal.warnings || []),...unmatched];
  }

  async function scan(file) {
    if (!file || !state.data || state.scanStatus === "loading") return;
    state.lastFile = file;
    state.scanStatus = "loading"; state.scanError = ""; state.proposal = null; notify();
    try {
      state.preview = await readImage(file);
      if (state.preview.length > 4_200_000) throw new Error("La photo est trop lourde. Recadrez-la puis réessayez.");
      const proposal = await call("match-entry/scan", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({image:state.preview, roster:state.data.match.players.map(player => player.name)}),
      });
      state.proposal = proposal;
      applyProposal(proposal);
      state.scanStatus = "done";
    } catch (error) {
      state.scanStatus = ""; state.scanError = error.message || "La photo n’a pas pu être lue.";
    }
    notify();
  }

  function integer(formData,name) {
    const value = Number(formData.get(name));
    return Number.isSafeInteger(value) ? value : Number.NaN;
  }

  async function submit(formElement) {
    if (!state.data || state.submitting) return;
    const data = new FormData(formElement);
    const match = state.data.match;
    const goals = match.players.map(player => ({profileId:player.id,count:integer(data,`goal-${player.id}`)}));
    const assists = match.players.map(player => ({profileId:player.id,count:integer(data,`assist-${player.id}`)}));
    const playerRatings = match.players.filter(player => player.ratingEligible).map(player => ({profileId:player.id,grade:integer(data,`rating-${player.id}`)}));
    const payload = {
      confirmed:data.get("confirmed") === "on", eventId:match.id, revision:match.revision,
      score:{lykos:integer(data,"scoreLykos"),opponent:integer(data,"scoreOpponent")},
      ownGoals:integer(data,"ownGoals"), goals, assists, playerRatings, matchRating:state.form.matchRating,
      mvpProfileId:state.form.mvpProfileId || null,
    };
    const goalTotal = goals.reduce((total,item) => total + (Number.isFinite(item.count)?item.count:0),0) + payload.ownGoals;
    if (goalTotal !== payload.score.lykos) {
      state.error = message("match_goals_score_mismatch"); notify(); return;
    }
    if (!payload.matchRating) {state.error = "Choisissez une note du match entre 1 et 6.";notify();return;}
    if (playerRatings.some(item => !Number.isInteger(item.grade) || item.grade < 1 || item.grade > 10)) {state.error = message("incomplete_player_ratings");notify();return;}
    state.submitting = true; state.error = ""; state.result = null; notify();
    try {
      state.result = await call("match-entry/approve", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      state.preview = ""; state.proposal = null;
      await load(match.id);
      state.result = {status:"complete"};
    } catch (error) {
      state.error = error.message;
    } finally {
      state.submitting = false; notify();
    }
  }

  async function submitPrematchRoster(formElement) {
    if (!state.prematch || state.prematchSaving) return;
    const playerIds = new FormData(formElement).getAll("playerIds").map(String);
    if (playerIds.length < 5) {state.prematchSaveError=message("invalid_manual_roster_players");state.prematchSaved=false;notify();return;}
    const eventId = state.prematch.match.id;
    state.prematchSaving = true; state.prematchSaveError = ""; state.prematchSaved = false; notify();
    try {
      await call("prematch/roster", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventId,playerIds})});
      state.prematch = null;
      await loadPrematch(eventId);
      state.prematchSaved = true;
    } catch (error) {
      state.prematchSaveError = error.message;
    } finally {
      state.prematchSaving = false; notify();
    }
  }

  async function submitCoaching(formElement) {
    if (state.coachingSaving) return;
    const data=new FormData(formElement);
    const payload={scope:formElement.dataset.coachingScope,content:data.get("content"),category:data.get("category"),importance:Number(data.get("importance")),eventId:data.get("eventId"),eventLabel:data.get("eventLabel"),occurredAt:data.get("occurredAt") || new Date().toISOString()};
    state.coachingSaving=true;state.coachingError="";state.coachingSaved=false;notify();
    try {
      await call("coaching/observation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      state.coaching=null;
      await loadCoaching();
      state.coachingSaved=true;
    } catch (error) {state.coachingError=error.message;}
    finally {state.coachingSaving=false;notify();}
  }

  async function submitTrainingObjective(formElement) {
    if (state.objectiveSaving) return;
    const data=new FormData(formElement);
    const payload={trainingId:data.get("trainingId"),trainingLabel:data.get("trainingLabel"),plannedFor:data.get("plannedFor"),content:data.get("content"),category:data.get("category")};
    state.objectiveSaving="new";state.objectiveError="";state.objectiveSaved="";notify();
    try {
      await call("coaching/objective",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      state.coaching=null;
      await loadCoaching();
      state.objectiveSaved="created";
    } catch (error) {state.objectiveError=error.message;}
    finally {state.objectiveSaving="";notify();}
  }

  async function submitObjectiveAssessment(formElement) {
    if (state.objectiveSaving) return;
    const objectiveId=formElement.dataset.objectiveId;
    const data=new FormData(formElement);
    const payload={objectiveId,score:Number(data.get("score")),note:data.get("note")};
    state.objectiveSaving=objectiveId;state.objectiveError="";state.objectiveSaved="";notify();
    try {
      await call("coaching/objective-assessment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      state.coaching=null;
      await loadCoaching();
      state.objectiveSaved=objectiveId;
    } catch (error) {state.objectiveError=error.message;}
    finally {state.objectiveSaving="";notify();}
  }

  document.addEventListener("click", event => {
    const mode = event.target.closest?.("[data-match-mode]");
    if (mode) {
      state.mode = mode.dataset.matchMode;
      notify();
      if (state.mode === "pre" && !state.prematch && !state.prematchLoading) loadPrematch();
      if (state.mode === "post" && !state.data && !state.loading) load();
      return;
    }
    const filter=event.target.closest?.("[data-plan-filter]");
    if (filter) {state.planFilter=filter.dataset.planFilter;notify();return;}
    const training=event.target.closest?.("[data-training-id]");
    if (training) {state.trainingSelectedId=training.dataset.trainingId;state.coachingSaved=false;state.objectiveSaved="";state.objectiveError="";notify();return;}
    if (event.target.closest?.("[data-prematch-retry]")) {state.prematchError="";state.prematch=null;loadPrematch();return;}
    const retry = event.target.closest?.("[data-match-retry]");
    if (retry) {state.error="";state.data=null;load();return;}
    if (event.target.closest?.("[data-match-scan-retry]") && state.lastFile) {scan(state.lastFile);return;}
    const star = event.target.closest?.("[data-match-star]");
    if (star && state.form) {state.form.matchRating=Number(star.dataset.matchStar);notify();}
    const step = event.target.closest?.("[data-match-step-target]");
    if (step) {document.getElementById(step.dataset.matchStepTarget)?.scrollIntoView({behavior:"smooth",block:"start"});return;}
    const mvp = event.target.closest?.("[data-match-mvp]");
    if (mvp && state.form) {state.form.mvpProfileId=mvp.dataset.matchMvp;notify();return;}
    if (event.target.closest?.("[data-match-mvp-clear]") && state.form) {state.form.mvpProfileId="";notify();}
  });
  document.addEventListener("pointerover", event => {
    const star = event.target.closest?.("[data-match-star]");
    if (!star) return;
    const root = star.closest(".match-stars");
    root?.querySelectorAll("[data-match-star]").forEach(button => button.classList.toggle("is-preview",Number(button.dataset.matchStar)<=Number(star.dataset.matchStar)));
  });
  document.addEventListener("pointerout", event => {
    const root = event.target.closest?.(".match-stars");
    if (root && !root.contains(event.relatedTarget)) root.querySelectorAll(".is-preview").forEach(button => button.classList.remove("is-preview"));
  });
  document.addEventListener("change", event => {
    if (event.target.matches?.("[data-prematch-select]")) {state.prematchSelectedId=event.target.value;state.prematch=null;loadPrematch(state.prematchSelectedId);return;}
    if (event.target.matches?.('[data-prematch-roster-form] input[name="playerIds"]')) {
      const form = event.target.closest("[data-prematch-roster-form]");
      const count = form?.querySelectorAll('input[name="playerIds"]:checked').length || 0;
      const output = form?.querySelector("[data-prematch-roster-count]");
      if (output) output.textContent = `${count} sélectionné${count > 1 ? "s" : ""}`;
      return;
    }
    if (event.target.matches?.("[data-match-select]")) {state.selectedId=event.target.value;state.preview="";state.proposal=null;load(state.selectedId);return;}
    if (event.target.matches?.("[data-match-photo]")) scan(event.target.files?.[0]);
  });
  document.addEventListener("input", event => {
    if (!state.form || !event.target.closest?.("[data-match-form]")) return;
    const name = event.target.name || "";
    if (name === "scoreLykos") state.form.scoreLykos = event.target.value;
    else if (name === "scoreOpponent") state.form.scoreOpponent = event.target.value;
    else if (name === "ownGoals") state.form.ownGoals = event.target.value;
    else if (name === "confirmed") state.form.confirmed = event.target.checked;
    else if (name.startsWith("goal-")) state.form.goals[name.slice(5)] = event.target.value;
    else if (name.startsWith("assist-")) state.form.assists[name.slice(7)] = event.target.value;
    else if (event.target.matches?.("[data-match-rating]")) {
      const playerId = event.target.dataset.matchRating;
      const value = Number(event.target.value);
      state.form.ratings[playerId] = value;
      event.target.style.setProperty("--match-rating-pct",`${((value-1)/9)*100}%`);
      event.target.style.setProperty("--match-rating-color",ratingColor(value));
      const row = event.target.closest(".match-player-rating");
      const output = row?.querySelector(`[data-match-rating-output="${playerId}"]`);
      const hidden = row?.querySelector(`input[name="rating-${playerId}"]`);
      if (output) {output.value=String(value);output.textContent=String(value);output.style.setProperty("--match-rating-color",ratingColor(value));}
      if (hidden) hidden.value=String(value);
    }
  });
  document.addEventListener("submit", event => {
    if (event.target.matches?.("[data-training-objective-form]")) {
      event.preventDefault(); submitTrainingObjective(event.target); return;
    }
    if (event.target.matches?.("[data-objective-assessment-form]")) {
      event.preventDefault(); submitObjectiveAssessment(event.target); return;
    }
    if (event.target.matches?.("[data-coaching-form]")) {
      event.preventDefault(); submitCoaching(event.target); return;
    }
    if (event.target.matches?.("[data-prematch-roster-form]")) {
      event.preventDefault(); submitPrematchRoster(event.target); return;
    }
    if (!event.target.matches?.("[data-match-form]")) return;
    event.preventDefault(); submit(event.target);
  });
  document.addEventListener("keydown", event => {
    const tab = event.target.closest?.("[data-match-mode]");
    if (!tab || !["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...tab.closest('[role="tablist"]')?.querySelectorAll('[role="tab"]') || []];
    if (!tabs.length) return;
    const current = tabs.indexOf(tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length-1 : event.key === "ArrowRight" ? (current+1)%tabs.length : (current-1+tabs.length)%tabs.length;
    tabs[next].click();
    requestAnimationFrame(() => document.querySelector(`[data-match-mode="${state.mode}"]`)?.focus());
  });
  const receiveSession = event => {
    state.token = typeof event.detail?.token === "string" ? event.detail.token : "";
    if (!state.token) Object.assign(state,{prematch:null,prematchLoading:false,prematchError:"",prematchSelectedId:"",prematchSaving:false,prematchSaveError:"",prematchSaved:false,coaching:null,coachingLoading:false,coachingError:"",coachingSaving:false,coachingSaved:false,loading:false,error:"",data:null,selectedId:"",scanStatus:"",scanError:"",preview:"",proposal:null,form:null,submitting:false,result:null});
    notify();
  };
  window.addEventListener("lykos:hub-session",receiveSession);
  window.addEventListener("lykos:estaff-cloud-session",receiveSession);

  window.LykosMatchEntry = {view};
})();
