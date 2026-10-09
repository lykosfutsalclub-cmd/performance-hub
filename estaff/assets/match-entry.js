(() => {
  "use strict";

  const API = "https://lykos-estaff-service.lykosfutsalclub.workers.dev/api/estaff";
  const state = {
    token:"", loading:false, error:"", data:null, selectedId:"", scanStatus:"", scanError:"",
    preview:"", proposal:null, form:null, submitting:false, result:null,
  };

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[character]));
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const notify = () => window.dispatchEvent(new CustomEvent("lykos:match-entry-updated"));

  function message(error) {
    const messages = {
      sporteasy_authentication_failed:"La connexion SportEasy doit être renouvelée.",
      no_recent_match:"Aucun match récent n’a été trouvé dans SportEasy.",
      match_context_unavailable:"Les informations du match sont momentanément indisponibles.",
      match_photo_reader_unavailable:"La lecture de photo n’est pas disponible. La saisie manuelle reste possible.",
      match_photo_read_failed:"La photo n’a pas pu être lue. Recadrez-la ou saisissez les informations manuellement.",
      match_changed_since_review:"La fiche SportEasy a changé pendant votre saisie. Rechargez-la avant de valider.",
      match_goals_score_mismatch:"Le total des buts des joueurs et des buts contre son camp doit être égal au score du Lykos.",
      incomplete_player_ratings:"Tous les joueurs proposés doivent avoir une note sur 10.",
      match_rating_already_submitted:"La note de ce match a déjà été envoyée depuis ce compte SportEasy.",
      match_update_failed:"La mise à jour SportEasy n’a pas pu être terminée.",
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
      const error = new Error(message(payload.error));
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
      ratings:{},
      matchRating:0,
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

  function ensureLoaded() {
    if (!state.token) {
      const sharedSession = window.LYKOS_HUB_ACCESS?.getSession?.();
      if (typeof sharedSession?.token === "string") state.token = sharedSession.token;
    }
    if (state.token && !state.loading && !state.data && !state.error) load();
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date inconnue" : new Intl.DateTimeFormat("fr-FR", {dateStyle:"full", timeStyle:"short", timeZone:"Europe/Paris"}).format(date);
  }

  function stars(value) {
    return `<div class="match-stars" role="radiogroup" aria-label="Note du match sur 6">${[1,2,3,4,5,6].map(number => `<button type="button" data-match-star="${number}" role="radio" aria-checked="${value===number}" class="${value>=number?"is-selected":""}">★<span>${number}</span></button>`).join("")}</div>`;
  }

  function playerRows(match, form) {
    return match.players.map(player => {
      const eligible = player.ratingEligible;
      return `<article class="match-player-row">
        <span class="match-player-initial">${escapeHtml((player.firstName || player.name || "?").slice(0,1).toUpperCase())}</span>
        <div><strong>${escapeHtml(player.name)}</strong><small>${player.played?"A participé au match":"Statistiques disponibles"}</small></div>
        <label><span>Buts</span><input type="number" min="0" max="40" inputmode="numeric" name="goal-${player.id}" value="${escapeHtml(form.goals[player.id] ?? 0)}"></label>
        ${eligible ? `<label><span>Note /10</span><input type="number" min="1" max="10" inputmode="numeric" name="rating-${player.id}" value="${escapeHtml(form.ratings[player.id] ?? "")}" required></label>` : `<span class="match-rating-state">${player.ratingLocked?"Note déjà envoyée":player.played?"Votre propre fiche":"Non noté"}</span>`}
      </article>`;
    }).join("");
  }

  function warnings() {
    const proposal = state.proposal;
    if (!proposal) return "";
    const items = [...(proposal.warnings || [])];
    if (proposal.confidence !== "high") items.unshift("La lecture automatique est incertaine : contrôlez chaque valeur.");
    return items.length ? `<div class="match-warning"><strong>Points à contrôler</strong><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : `<p class="match-ok">✓ Lecture nette. Un contrôle humain reste obligatoire.</p>`;
  }

  function readyView() {
    const match = state.data.match;
    const form = state.form || freshForm(match);
    const eligible = match.players.filter(player => player.ratingEligible);
    return `<main class="company-main match-entry-main">
      <section class="company-title match-title"><div><p>Compte-rendu terrain</p><h1>Match</h1><span>Photo, contrôle humain, puis synchronisation SportEasy.</span></div><span class="match-safety">Aucune donnée n’est publiée avant votre approbation.</span></section>
      <form data-match-form class="match-workflow">
        <section class="match-card match-context">
          <header><span>1</span><div><small>Match SportEasy</small><h2>Choisir la bonne rencontre</h2></div></header>
          <label class="match-select"><span>Rencontre à compléter</span><select data-match-select>${state.data.candidates.map(candidate => `<option value="${candidate.id}" ${candidate.id===match.id?"selected":""}>${escapeHtml(candidate.opponent)} · ${escapeHtml(formatDate(candidate.startAt))}</option>`).join("")}</select></label>
          <div class="match-selected"><strong>${escapeHtml(match.name)}</strong><span>${escapeHtml(formatDate(match.startAt))}</span><a href="https://app.sporteasy.net/event/${encodeURIComponent(match.id)}/" target="_blank" rel="noopener noreferrer">Ouvrir la fiche SportEasy ↗</a></div>
        </section>

        <section class="match-card match-photo">
          <header><span>2</span><div><small>Feuille de bord terrain</small><h2>Photographier ou importer</h2></div></header>
          <label class="match-drop ${state.preview?"has-preview":""}">
            ${state.preview?`<img src="${state.preview}" alt="Aperçu de la feuille de match">`:`<b>📷</b><strong>Prendre la feuille en photo</strong><small>Bien cadrée, à plat, avec les noms et les traits de buts visibles.</small>`}
            <input type="file" data-match-photo accept="image/jpeg,image/png,image/webp" capture="environment">
          </label>
          <p class="match-privacy">🔒 La photo est transmise de façon temporaire pour être lue, puis n’est pas conservée. Vous pouvez aussi tout saisir à la main.</p>
          ${state.scanStatus==="loading"?`<p class="match-processing"><i></i>Lecture de la feuille en cours…</p>`:""}
          ${state.scanError?`<p class="match-error" role="alert">${escapeHtml(state.scanError)}</p>`:""}
          ${warnings()}
        </section>

        <section class="match-card match-score-card">
          <header><span>3</span><div><small>Transcription à contrôler</small><h2>Score et buteurs</h2></div></header>
          <div class="match-score">
            <label><span>Lykos FC</span><input type="number" min="0" max="99" inputmode="numeric" name="scoreLykos" value="${escapeHtml(form.scoreLykos)}" required></label>
            <b>–</b>
            <label><span>${escapeHtml(match.opponent)}</span><input type="number" min="0" max="99" inputmode="numeric" name="scoreOpponent" value="${escapeHtml(form.scoreOpponent)}" required></label>
          </div>
          <label class="match-own-goals"><span>Buts du Lykos non attribués à un joueur (contre son camp)</span><input type="number" min="0" max="20" inputmode="numeric" name="ownGoals" value="${escapeHtml(form.ownGoals)}"></label>
          <div class="match-player-list">${playerRows(match,form)}</div>
        </section>

        <section class="match-card match-rating-card">
          <header><span>4</span><div><small>Appréciation manuelle</small><h2>Noter le match sur 6</h2></div></header>
          ${match.matchRatingLocked?`<p class="match-warning">La note du match a déjà été envoyée depuis ce compte SportEasy.</p>`:stars(form.matchRating)}
          <p>Les notes joueurs sur 10 sont saisies dans la liste ci-dessus. Elles alimentent la moyenne SportEasy et deviennent définitives après l’envoi.</p>
        </section>

        <section class="match-card match-approval">
          <header><span>5</span><div><small>Dernier contrôle</small><h2>Approuver et envoyer</h2></div></header>
          <label class="match-confirm"><input type="checkbox" name="confirmed" ${form.confirmed?"checked":""} required><span>J’ai contrôlé le match, le score, tous les buteurs et toutes les notes. J’autorise leur mise à jour immédiate dans SportEasy.</span></label>
          ${state.error?`<p class="match-error" role="alert">${escapeHtml(state.error)}</p>`:""}
          ${state.result?`<div class="match-success"><strong>✓ SportEasy est à jour</strong><span>Score, buts et notes ont été enregistrés.</span></div>`:""}
          <button type="submit" class="company-primary match-submit" ${state.submitting||match.matchRatingLocked||!eligible.length?"disabled":""}>${state.submitting?"Synchronisation en cours…":"Approuver et mettre à jour SportEasy"}</button>
        </section>
      </form>
    </main>`;
  }

  function view() {
    ensureLoaded();
    if (state.loading && !state.data) return `<main class="company-main match-entry-main"><section class="company-title"><div><p>Compte-rendu terrain</p><h1>Match</h1></div></section><div class="match-loading"><i></i><strong>Connexion à SportEasy…</strong></div></main>`;
    if (state.error && !state.data) return `<main class="company-main match-entry-main"><section class="company-title"><div><p>Compte-rendu terrain</p><h1>Match</h1></div></section><div class="match-empty"><strong>${escapeHtml(state.error)}</strong><button type="button" class="company-primary" data-match-retry>Réessayer</button></div></main>`;
    return state.data ? readyView() : `<main class="company-main match-entry-main"></main>`;
  }

  function readImage(file) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const scale = Math.min(1,1800/Math.max(image.width,image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1,Math.round(image.width*scale));
          canvas.height = Math.max(1,Math.round(image.height*scale));
          canvas.getContext("2d",{alpha:false}).drawImage(image,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL("image/jpeg",.84));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
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
    proposal.warnings = [...(proposal.warnings || []),...unmatched];
  }

  async function scan(file) {
    if (!file || !state.data || state.scanStatus === "loading") return;
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
    const playerRatings = match.players.filter(player => player.ratingEligible).map(player => ({profileId:player.id,grade:integer(data,`rating-${player.id}`)}));
    const payload = {
      confirmed:data.get("confirmed") === "on", eventId:match.id, revision:match.revision,
      score:{lykos:integer(data,"scoreLykos"),opponent:integer(data,"scoreOpponent")},
      ownGoals:integer(data,"ownGoals"), goals, playerRatings, matchRating:state.form.matchRating,
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

  document.addEventListener("click", event => {
    const retry = event.target.closest?.("[data-match-retry]");
    if (retry) {state.error="";state.data=null;load();return;}
    const star = event.target.closest?.("[data-match-star]");
    if (star && state.form) {state.form.matchRating=Number(star.dataset.matchStar);notify();}
  });
  document.addEventListener("change", event => {
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
    else if (name.startsWith("rating-")) state.form.ratings[name.slice(7)] = event.target.value;
  });
  document.addEventListener("submit", event => {
    if (!event.target.matches?.("[data-match-form]")) return;
    event.preventDefault(); submit(event.target);
  });
  const receiveSession = event => {
    state.token = typeof event.detail?.token === "string" ? event.detail.token : "";
    if (!state.token) Object.assign(state,{loading:false,error:"",data:null,selectedId:"",scanStatus:"",scanError:"",preview:"",proposal:null,form:null,submitting:false,result:null});
    notify();
  };
  window.addEventListener("lykos:hub-session",receiveSession);
  window.addEventListener("lykos:estaff-cloud-session",receiveSession);

  window.LykosMatchEntry = {view};
})();
