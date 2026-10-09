(() => {
  "use strict";

  const MATCH_ASSET_BASE = new URL(".",document.currentScript?.src || window.location.href).href;
  const API = "https://lykos-estaff-service.lykosfutsalclub.workers.dev/api/estaff";
  let heicConverterPromise = null;
  const state = {
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
    </main>`;
  }

  function view() {
    ensureLoaded();
    if (state.loading && !state.data) return `<main class="company-main match-entry-main"><section class="company-title"><div><h1>Saisie match</h1></div></section><div class="match-loading"><i></i><strong>Connexion à SportEasy…</strong></div></main>`;
    if (state.error && !state.data) return `<main class="company-main match-entry-main"><section class="company-title"><div><h1>Saisie match</h1></div></section><div class="match-empty"><strong>${escapeHtml(state.error)}</strong><button type="button" class="company-primary" data-match-retry>Réessayer</button></div></main>`;
    return state.data ? readyView() : `<main class="company-main match-entry-main"></main>`;
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

  document.addEventListener("click", event => {
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
