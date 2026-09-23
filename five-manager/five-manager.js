(() => {
  'use strict';

  const TEAM = window.LYKOS_TEAM_STATS || {};
  const SECONDARY = window.LYKOS_SECONDARY_STATS || {};
  const PANTHEON = window.LYKOS_PANTHEON_STATS || {};
  const CURRENT = TEAM.periods?.current || {};
  const CURRENT_STATS = SECONDARY.periods?.current?.players || {};
  const ALL_TIME_STATS = SECONDARY.periods?.allTime?.players || {};

  const CURRENT_PLAYERS = [
    ['joueur-adrien-zammut', 'Adrien Zammut', 'ATT'],
    ['joueur-alexandre-dato', 'Alexandre Dato', 'DEF'],
    ['joueur-bacem-oines', 'Bacem Oines', 'M'],
    ['joueur-el-hathate-achraf', 'Achrafe El Hathate', 'M'],
    ['joueur-enzo-sales', 'Enzo Sales', 'DEF'],
    ['joueur-fabien-perals', 'Fabien Perals', 'G'],
    ['joueur-gabriel-perals', 'Gabriel Perals', 'G'],
    ['joueur-gaetan-fourmont', 'Gaetan Fourmont', 'ATT'],
    ['joueur-guillaume-dato', 'Guillaume Dato', 'ATT'],
    ['joueur-florian-florisse', 'Florian Florisse', 'M'],
    ['joueur-hugo-barranco', 'Hugo Barranco', 'ATT'],
    ['joueur-luca-jay', 'Luca Jay', 'M'],
    ['joueur-mathis-rousset', 'Mathis Rousset', 'DEF'],
    ['joueur-nicolas-boulin', 'Nicolas Boulin', 'M'],
    ['joueur-quentin-guion', 'Quentin Guion', 'M'],
    ['joueur-rachid-azzaoui', 'Rachid Azzaoui', 'DEF'],
    ['joueur-robin-paya', 'Robin Paya', 'ATT'],
    ['joueur-simon-jacquier', 'Simon Jacquier', 'ATT'],
    ['joueur-tommy-lejoyeux', 'Tommy Lejoyeux', 'M'],
  ];

  const ROLE_LABELS = { G: 'Gardien', DEF: 'Défenseur', M: 'Milieu polyvalent', ATT: 'Attaquant' };
  const FORMATIONS = {
    '1-2-1': [
      { role: 'Gardien', accepts: ['G'], x: 50, y: 88 },
      { role: 'Pointe basse', accepts: ['DEF', 'M'], x: 50, y: 67 },
      { role: 'Ailier gauche', accepts: ['M', 'ATT', 'DEF'], x: 24, y: 45 },
      { role: 'Ailier droit', accepts: ['M', 'ATT', 'DEF'], x: 76, y: 45 },
      { role: 'Pivot', accepts: ['ATT', 'M'], x: 50, y: 20 },
    ],
    '2-1-1': [
      { role: 'Gardien', accepts: ['G'], x: 50, y: 88 },
      { role: 'Défenseur gauche', accepts: ['DEF', 'M'], x: 28, y: 66 },
      { role: 'Défenseur droit', accepts: ['DEF', 'M'], x: 72, y: 66 },
      { role: 'Meneur', accepts: ['M', 'ATT'], x: 50, y: 44 },
      { role: 'Pivot', accepts: ['ATT', 'M'], x: 50, y: 19 },
    ],
    '2-2': [
      { role: 'Gardien', accepts: ['G'], x: 50, y: 88 },
      { role: 'Défenseur gauche', accepts: ['DEF', 'M'], x: 28, y: 64 },
      { role: 'Défenseur droit', accepts: ['DEF', 'M'], x: 72, y: 64 },
      { role: 'Attaquant gauche', accepts: ['ATT', 'M'], x: 28, y: 27 },
      { role: 'Attaquant droit', accepts: ['ATT', 'M'], x: 72, y: 27 },
    ],
    '1-1-2': [
      { role: 'Gardien', accepts: ['G'], x: 50, y: 88 },
      { role: 'Pointe basse', accepts: ['DEF', 'M'], x: 50, y: 68 },
      { role: 'Meneur', accepts: ['M', 'ATT'], x: 50, y: 49 },
      { role: 'Attaquant gauche', accepts: ['ATT', 'M'], x: 28, y: 23 },
      { role: 'Attaquant droit', accepts: ['ATT', 'M'], x: 72, y: 23 },
    ],
  };

  const ROUTES = {
    home: { title: 'Accueil', kicker: 'Centre de gestion', subtitle: 'Décider à partir des données vérifiées du Performance Hub.' },
    squad: { title: 'Équipe', kicker: 'Effectif actuel', subtitle: 'Lecture de l’effectif, de la hiérarchie et de la profondeur poste par poste.', tabs: [['roster', 'Effectif'], ['hierarchy', 'Hiérarchie'], ['depth', 'Profondeur'], ['stats', 'Statistiques']] },
    lineup: { title: 'Composition', kicker: 'Tableau tactique', subtitle: 'Construire un cinq, comparer les équilibres et lire les relations recensées.' },
    match: { title: 'Match', kicker: 'Centre de match', subtitle: 'Préparer la prochaine rencontre et relire la dernière prestation connue.', tabs: [['overview', 'Aperçu'], ['group', 'Groupe'], ['preparation', 'Préparation'], ['postmatch', 'Après-match']] },
    report: { title: 'Rapport', kicker: 'Rapport d’équipe', subtitle: 'Forces observées, points de vigilance et signaux collectifs.', tabs: [['summary', 'Résumé'], ['depth', 'Profondeur'], ['stats', 'Stats équipe'], ['dynamics', 'Dynamiques'], ['collective', 'Collectif']] },
    availability: { title: 'Disponibilités', kicker: 'Suivi de l’effectif', subtitle: 'Présence, charge et retours sans extrapoler au-delà des données disponibles.', tabs: [['general', 'Général'], ['absences', 'Absences'], ['load', 'Charge'], ['returns', 'Retours']] },
    history: { title: 'Historique', kicker: 'Archives sportives', subtitle: 'Records, saisons et matchs consignés depuis 2019.', tabs: [['records', 'Records'], ['seasons', 'Saisons'], ['matches', 'Matchs']] },
    staff: { title: 'Staff', kicker: 'Regards métier', subtitle: 'Les personnes de l’eStaff qui contribuent à la lecture et au pilotage du club.' },
  };
  const DEFAULT_TABS = { squad: 'roster', match: 'overview', report: 'summary', availability: 'general', history: 'records' };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const content = $('[data-content]');
  const subnav = $('[data-subnav]');
  const dialog = $('[data-dialog]');
  const toastNode = $('[data-toast]');
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const num = (value, digits = 1) => value == null || Number.isNaN(Number(value)) ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(Number(value));
  const dateFR = (value) => value ? new Intl.DateTimeFormat('fr-FR').format(new Date(`${value}T12:00:00`)) : '—';
  const safeJSON = (value, fallback) => { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } };
  const humanizePlayerId = (id) => String(id || '').replace(/^joueur-/, '').split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ')
    .replace('Dim Couvrat', 'Dimitri Couvrat').replace('El Hathate Achraf', 'Achrafe El Hathate').replace('Loic', 'Loïc');
  const playerButton = (player) => `<button class="fm-player-link" type="button" data-player="${esc(player.id)}">${esc(player.name)}</button>`;
  const ratingBand = (value) => value >= 80 ? 'elite' : value >= 65 ? 'good' : value >= 50 ? 'average' : value >= 35 ? 'warning' : 'low';
  const rating = (value) => value == null ? '<span class="fm-rating">—</span>' : `<span class="fm-rating" data-band="${ratingBand(value)}">${num(value, 0)}</span>`;
  const info = (title, body) => `<button type="button" class="fm-info" data-info-title="${esc(title)}" data-info="${esc(body)}" aria-label="Explication : ${esc(title)}">i</button>`;

  const players = CURRENT_PLAYERS.map(([id, name, position]) => {
    const raw = CURRENT_STATS[id] || {};
    const primary = raw.primary || {};
    return {
      id, name, position,
      matches: primary.matches || 0,
      wins: primary.detailedResults?.wins || 0,
      draws: primary.detailedResults?.draws || 0,
      losses: primary.detailedResults?.losses || 0,
      goals: primary.goals || 0,
      assists: primary.assists || 0,
      hdm: primary.manOfTheMatch || 0,
      averageRating: primary.averageRating || null,
      metron: raw.performance?.overall ?? null,
      creation: raw.performance?.creation ?? null,
      finishing: raw.performance?.finishing ?? null,
      offensive: raw.performance?.offensive ?? null,
      defensive: raw.performance?.defensive ?? null,
      contributions: raw.offensive?.contributions || 0,
      contributionsPerGame: raw.offensive?.contributionsPerGame || 0,
      goalsAgainstPerGame: raw.defensive?.goalsAgainstPerGame ?? null,
      collective: raw.collective || {},
    };
  });
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const allFixtures = Object.values(CURRENT.scoreDistribution || []).flatMap((bucket) => bucket.fixtures || []).sort((a, b) => b.date.localeCompare(a.date));
  const latestFixture = allFixtures[0] || null;
  const bestPlayers = [...players].sort((a, b) => (b.metron ?? -1) - (a.metron ?? -1) || b.contributions - a.contributions);

  const state = {
    route: 'home', sub: null, sort: 'metron', direction: -1, search: '', role: 'all', period: 'current', comparePeriod: 'none',
    formation: '1-2-1', mode: 'balanced', lineup: [], dragged: null,
    hierarchy: safeJSON(localStorage.getItem('lykos_fm_hierarchy_v1'), {}),
    group: safeJSON(localStorage.getItem('lykos_fm_group_v1'), []),
  };
  const savedLineup = safeJSON(localStorage.getItem('lykos_fm_lineup_v1'), null);
  if (savedLineup?.formation && FORMATIONS[savedLineup.formation]) state.formation = savedLineup.formation;
  if (Array.isArray(savedLineup?.lineup)) state.lineup = savedLineup.lineup;

  function fixtureResult(fixture) {
    if (!fixture) return '';
    return fixture.scoreFor > fixture.scoreAgainst ? 'Victoire' : fixture.scoreFor < fixture.scoreAgainst ? 'Défaite' : 'Nul';
  }
  function formHTML() {
    return `<div class="fm-form">${(CURRENT.recentResults || []).map((result) => `<span class="${result === 'victory' ? 'win' : result === 'defeat' ? 'loss' : 'draw'}">${result === 'victory' ? 'V' : result === 'defeat' ? 'D' : 'N'}</span>`).join('')}</div>`;
  }
  function panel(title, body, extra = '', cls = '') {
    return `<article class="fm-panel ${cls}"><header class="fm-panel-head"><h2>${title}</h2>${extra}</header><div class="fm-panel-body">${body}</div></article>`;
  }
  function kpi(label, value, detail, tone = '') {
    return `<div class="fm-kpi"${tone ? ` data-tone="${tone}"` : ''}><small>${label}</small><strong>${value}</strong><em>${detail}</em></div>`;
  }
  function empty(title, text) { return `<div class="fm-empty"><div><b>${title}</b><p>${text}</p></div></div>`; }
  function showDialog(title, body) {
    $('[data-dialog-title]').textContent = title;
    $('[data-dialog-body]').innerHTML = body;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  let toastTimer;
  function toast(message) {
    clearTimeout(toastTimer); toastNode.textContent = message; toastNode.hidden = false;
    toastTimer = setTimeout(() => { toastNode.hidden = true; }, 3300);
  }
  function openPlayer(id) {
    const player = playerMap.get(id) || { id };
    sessionStorage.setItem('lykos_five_manager_return', JSON.stringify({ href: location.href, scrollY: scrollY, route: state.route, sub: state.sub }));
    location.href = `../?view=players&player=${encodeURIComponent(player.id)}&from=five-manager`;
  }
  function formatFreshness() {
    const dates = [TEAM.generatedAt, SECONDARY.generatedAt, PANTHEON.generatedAt].filter(Boolean).map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
    if (!dates.length) return 'Dernier état fiable : date indisponible';
    const oldest = new Date(Math.min(...dates));
    return `Dernier état fiable : ${oldest.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' })}`;
  }
  function periodPlayer(player, period = state.period) {
    const periodKey = period === 'alltime' ? 'allTime' : period;
    const raw = SECONDARY.periods?.[periodKey]?.players?.[player.id] || {};
    const primary = raw.primary || {};
    return {
      ...player,
      matches: primary.matches || 0,
      wins: primary.detailedResults?.wins || 0,
      draws: primary.detailedResults?.draws || 0,
      losses: primary.detailedResults?.losses || 0,
      goals: primary.goals || 0,
      assists: primary.assists || 0,
      hdm: primary.manOfTheMatch || 0,
      averageRating: primary.averageRating || null,
      metron: raw.performance?.overall ?? null,
    };
  }

  function renderHome() {
    const leaders = bestPlayers.slice(0, 3);
    const latest = latestFixture;
    const resultTone = latest && latest.scoreFor > latest.scoreAgainst ? 'positive' : latest && latest.scoreFor < latest.scoreAgainst ? 'negative' : '';
    return `<div class="fm-grid">
      <div class="fm-col-8">${panel('Prochain match', `<div class="fm-match-hero"><div class="fm-team"><img src="../logo-lykos-intro-carre-2026.png" alt=""><strong>Lykos FC</strong></div><div class="fm-score"><strong>—</strong><small>Date et adversaire à confirmer</small></div><div class="fm-team"><div class="fm-brand-placeholder" style="margin:auto">?</div><strong>Adversaire</strong></div></div><div class="fm-callout" data-tone="warning"><b>Aucune prochaine rencontre fiable n’est actuellement disponible dans les données publiques.</b> La préparation reste accessible, sans inventer d’adversaire ni d’horaire.</div><div class="fm-actions" style="margin-top:10px"><button class="fm-button is-primary" data-go="match" data-sub="preparation">Ouvrir la préparation</button><button class="fm-button" disabled title="Aucune rencontre future fiable">Feuille de match indisponible</button></div>`)}</div>
      <div class="fm-col-4">${panel('Forme de l’équipe', `<div class="fm-gauge"><div><div class="fm-gauge-arc"><i class="fm-gauge-needle" style="--needle:${-90 + Math.max(0, Math.min(99, CURRENT.form?.value || 0)) * 1.8}deg"></i></div><div class="fm-gauge-value"><strong>${num(CURRENT.form?.value, 1)}</strong><small>${esc(CURRENT.form?.label || 'Non notée')} · ${num(CURRENT.form?.matchCount, 0)} matchs</small></div></div></div>`, info('Note de forme', 'Note collective déjà calculée par le Performance Hub à partir des notes individuelles, de la note de l’événement, du résultat, de l’importance et de la difficulté adverse. Five Manager ne la recalcule pas.'))}</div>
      <div class="fm-col-7">${panel('Qualités observées', `<ul class="fm-list"><li data-tone="positive"><i></i><div><strong>Production offensive élevée</strong><small>${num(CURRENT.goalsForPerMatch, 2)} buts marqués par match sur la période.</small></div><b>+${num(CURRENT.goalDifference, 0)}</b></li><li data-tone="positive"><i></i><div><strong>Résultats favorables</strong><small>${num(CURRENT.wins, 0)} victoires en ${num(CURRENT.matchesPlayed, 0)} matchs.</small></div><b>${num(CURRENT.winRate, 1)} %</b></li><li data-tone="positive"><i></i><div><strong>Notation couverte</strong><small>Les matchs de la période disposent de notes d’événement et de notes individuelles.</small></div><b>${num(CURRENT.form?.gradeCoverage, 0)} %</b></li></ul>`)}</div>
      <div class="fm-col-5">${panel('Points de vigilance', `<ul class="fm-list"><li data-tone="negative"><i></i><div><strong>Volume encaissé</strong><small>Moyenne observée sur les scores disponibles.</small></div><b>${num(CURRENT.goalsAgainstPerMatch, 2)}</b></li><li><i></i><div><strong>Échantillon court</strong><small>La saison actuelle ne compte encore que peu de rencontres.</small></div><b>${num(CURRENT.matchesPlayed, 0)}</b></li><li><i></i><div><strong>Disponibilités non renseignées</strong><small>Aucune source médicale fiable n’est branchée au Hub.</small></div><b>À confirmer</b></li></ul>`)}</div>
      <div class="fm-col-6">${panel('Hommes du moment', `<ul class="fm-list">${leaders.map((player, index) => `<li><i></i><div><strong>${index + 1}. ${playerButton(player)}</strong><small>${num(player.goals, 0)} buts · ${num(player.assists, 0)} passes · ${num(player.matches, 0)} matchs</small></div>${rating(player.metron)}</li>`).join('')}</ul>`, info('Hommes du moment', 'Classement de la saison actuelle selon la note Metron déjà publiée, puis la contribution offensive en cas d’égalité.'))}</div>
      <div class="fm-col-6">${panel('Dernier match recensé', latest ? `<div class="fm-status-strip" data-tone="${resultTone}"><strong>${dateFR(latest.date)} · ${esc(latest.opponent)}</strong><span>${fixtureResult(latest)}</span></div><div class="fm-match-hero" style="padding-bottom:8px"><div class="fm-team"><img src="../logo-lykos-intro-carre-2026.png" alt=""><strong>Lykos FC</strong></div><div class="fm-score"><strong>${latest.scoreFor}–${latest.scoreAgainst}</strong><small>${fixtureResult(latest)}</small></div><div class="fm-team"><div class="fm-brand-placeholder" style="margin:auto">?</div><strong>${esc(latest.opponent)}</strong></div></div>${formHTML()}` : empty('Aucun match', 'Aucun résultat n’est disponible pour la période actuelle.'))}</div>
      <div class="fm-col-4">${panel('Disponibilités', `<div class="fm-kpis">${kpi('Disponibles', '—', 'source non branchée')}${kpi('Incertains', '—', 'source non branchée')}${kpi('Absents', '—', 'source non branchée')}${kpi('À confirmer', players.length, 'tout l’effectif')}</div><button class="fm-button" data-go="availability" data-sub="general" style="margin-top:10px">Contrôler</button>`, info('Disponibilités', 'Une absence de donnée ne vaut jamais confirmation de disponibilité.'))}</div>
      <div class="fm-col-4">${panel('Avis du staff', `<ul class="fm-list"><li><i></i><div><strong>Analyse de Giannis</strong><small>Forme collective positive, mais encore fondée sur ${CURRENT.matchesPlayed} matchs.</small></div></li><li><i></i><div><strong>Informations de Victor</strong><small>Les disponibilités doivent être confirmées avant toute sélection.</small></div></li><li><i></i><div><strong>Avis de Léonard</strong><small>La composition peut être préparée avec les rôles et Metron disponibles.</small></div></li></ul>`, info('Avis du staff', 'Synthèses factuelles rattachées aux missions officielles de chacun. Elles ne remplacent pas un rapport daté dans l’eStaff.'))}</div>
      <div class="fm-col-4">${panel('À traiter', `<ul class="fm-list"><li data-tone="negative"><i></i><div><strong>Prochain match incomplet</strong><small>Adversaire, date et lieu absents.</small></div><b>Priorité</b></li><li><i></i><div><strong>Disponibilités à contrôler</strong><small>${players.length} états non renseignés.</small></div><b>${players.length}</b></li><li><i></i><div><strong>Composition</strong><small>${state.lineup.filter(Boolean).length}/5 joueurs actuellement placés.</small></div><button class="fm-button" data-go="lineup">Traiter</button></li></ul>`)}</div>
      <div class="fm-col-12">${panel('Actions rapides', `<div class="fm-actions"><button class="fm-button is-primary" data-go="lineup">Composer le cinq</button><button class="fm-button" data-go="squad" data-sub="roster">Voir l’effectif</button><button class="fm-button" data-go="report" data-sub="summary">Lire le rapport</button><button class="fm-button" data-go="history" data-sub="records">Consulter les records</button><a class="fm-button" href="../estaff/">Ouvrir l’eStaff</a></div>`)}</div>
    </div>`;
  }

  function rosterRows() {
    const query = state.search.trim().toLocaleLowerCase('fr');
    const filtered = players.map((player) => periodPlayer(player)).filter((player) => (!query || player.name.toLocaleLowerCase('fr').includes(query)) && (state.role === 'all' || player.position === state.role));
    return filtered.sort((a, b) => {
      const av = state.sort === 'name' ? a.name : (a[state.sort] ?? -1);
      const bv = state.sort === 'name' ? b.name : (b[state.sort] ?? -1);
      return typeof av === 'string' ? av.localeCompare(bv, 'fr') * state.direction : (av - bv) * state.direction;
    });
  }
  function renderRoster() {
    const head = [['name', 'Joueur'], ['position', 'Poste'], ['matches', 'MJ'], ['wins', 'V'], ['draws', 'N'], ['losses', 'D'], ['goals', 'Buts'], ['assists', 'Passes'], ['hdm', 'HDM'], ['averageRating', 'Moy.'], ['metron', 'Metron']];
    const rows = rosterRows();
    return `${panel('Effectif actuel', `<div class="fm-filters"><input type="search" data-roster-search value="${esc(state.search)}" placeholder="Rechercher un joueur" aria-label="Rechercher un joueur"><select data-role-filter aria-label="Filtrer par poste"><option value="all">Tous les postes</option>${Object.entries(ROLE_LABELS).map(([key, label]) => `<option value="${key}"${state.role === key ? ' selected' : ''}>${label}</option>`).join('')}</select><select data-period-filter aria-label="Période"><option value="current"${state.period === 'current' ? ' selected' : ''}>Saison actuelle</option><option value="previous"${state.period === 'previous' ? ' selected' : ''}>Saison dernière</option><option value="alltime"${state.period === 'alltime' ? ' selected' : ''}>All-time</option></select><select data-compare-filter aria-label="Comparer avec"><option value="none">Sans comparaison</option><option value="current"${state.comparePeriod === 'current' ? ' selected' : ''}>Comparer à la saison actuelle</option><option value="previous"${state.comparePeriod === 'previous' ? ' selected' : ''}>Comparer à la saison dernière</option><option value="alltime"${state.comparePeriod === 'alltime' ? ' selected' : ''}>Comparer au all-time</option></select></div><div class="fm-table-wrap"><table class="fm-table"><thead><tr>${head.map(([key, label]) => `<th><button class="fm-table-sort" data-sort="${key}" data-active="${state.sort === key}">${label}${state.sort === key ? (state.direction < 0 ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}${state.comparePeriod !== 'none' ? '<th>Δ Metron</th>' : ''}<th>Présence</th><th>Disponibilité</th></tr></thead><tbody>${rows.map((player) => { const compared = state.comparePeriod === 'none' ? null : periodPlayer(player, state.comparePeriod); const delta = player.metron == null || compared?.metron == null ? null : player.metron - compared.metron; return `<tr><td>${playerButton(player)}</td><td>${ROLE_LABELS[player.position]}</td><td>${player.matches}</td><td>${player.wins}</td><td>${player.draws}</td><td>${player.losses}</td><td>${player.goals}</td><td>${player.assists}</td><td>${player.hdm}</td><td>${num(player.averageRating, 2)}</td><td>${rating(player.metron)}</td>${state.comparePeriod !== 'none' ? `<td>${delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}</td>` : ''}<td>${player.matches ? `${num(player.matches / Math.max(1, SECONDARY.periods?.[state.period === 'alltime' ? 'allTime' : state.period]?.matchCount) * 100, 0)} %` : '—'}</td><td>À confirmer</td></tr>`; }).join('')}</tbody></table></div>`, info('Disponibilité', 'Le Performance Hub ne dispose pas encore d’une source médicale suffisamment fiable. La présence correspond ici aux apparitions recensées sur la période, pas à l’assiduité aux entraînements.'))}`;
  }
  function renderHierarchy() {
    const statuses = [['', 'Non défini'], ['cadre', 'Cadre'], ['etabli', 'Joueur établi'], ['rotation', 'Rotation'], ['occasionnel', 'Occasionnel'], ['developpement', 'En développement']];
    return `<div class="fm-grid"><div class="fm-col-8">${panel('Hiérarchie sportive', `<div class="fm-callout"><b>Décision manuelle du coach.</b> Aucun statut définitif n’est déduit automatiquement. Les choix sont enregistrés uniquement sur cet appareil.</div><div class="fm-table-wrap" style="margin-top:10px"><table class="fm-table" style="min-width:700px"><thead><tr><th>Joueur</th><th>Poste</th><th>Matchs</th><th>Metron</th><th>Statut</th></tr></thead><tbody>${players.map((player) => `<tr><td>${playerButton(player)}</td><td>${ROLE_LABELS[player.position]}</td><td>${player.matches}</td><td>${rating(player.metron)}</td><td><select class="fm-role-select" data-hierarchy-player="${player.id}">${statuses.map(([key, label]) => `<option value="${key}"${state.hierarchy[player.id] === key ? ' selected' : ''}>${label}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`)}</div><div class="fm-col-4">${panel('Repères factuels', `<ul class="fm-list">${bestPlayers.slice(0, 5).map((player) => `<li><i></i><div><strong>${playerButton(player)}</strong><small>${num(player.matches, 0)} matchs · note moyenne ${num(player.averageRating, 2)}</small></div>${rating(player.metron)}</li>`).join('')}</ul>`, info('Repères', 'Ces repères statistiques peuvent éclairer une décision, mais ne déterminent pas automatiquement la place humaine d’un joueur dans le groupe.'))}</div></div>`;
  }
  function depthGroups() {
    const sort = (list, metric = 'metron') => [...list].sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1));
    const keepers = sort(players.filter((p) => p.position === 'G'), 'defensive');
    const defenders = sort(players.filter((p) => p.position === 'DEF'), 'defensive');
    const mids = sort(players.filter((p) => p.position === 'M'), 'creation');
    const attackers = sort(players.filter((p) => p.position === 'ATT'), 'offensive');
    return [
      ['Gardien', keepers], ['Pointe basse', defenders], ['Ailier gauche', mids.filter((_, i) => i % 2 === 0).concat(attackers.filter((_, i) => i % 2 === 0))],
      ['Ailier droit', mids.filter((_, i) => i % 2 === 1).concat(attackers.filter((_, i) => i % 2 === 1))], ['Pivot', attackers],
    ];
  }
  function renderDepth() {
    return panel('Profondeur par rôle', `<div class="fm-depth">${depthGroups().map(([label, list]) => { const count = list.length; const tone = count >= 4 ? 'positive' : count >= 2 ? '' : 'negative'; return `<section class="fm-depth-column"><h3>${label}</h3><div class="fm-status-strip" data-tone="${tone}"><strong>${count} solution${count > 1 ? 's' : ''}</strong><span>${count >= 4 ? 'Bien couvert' : count >= 2 ? 'Couverture moyenne' : 'Couverture faible'}</span></div><ol>${list.slice(0, 6).map((player, index) => `<li><span>${index + 1}</span>${playerButton(player)}${rating(player.metron)}</li>`).join('') || '<li><span>—</span><span>Aucun profil</span></li>'}</ol></section>`; }).join('')}</div>`, info('Profondeur', 'Projection par rôle à partir du poste officiel et des indicateurs Metron. Les ailiers peuvent provenir des milieux polyvalents et des attaquants.'));
  }
  function bars(list, metric, label) {
    const values = list.map((p) => p[metric] ?? 0); const max = Math.max(1, ...values);
    return `<div class="fm-bars">${list.map((player) => `<div class="fm-bar"><span>${playerButton(player)}</span><div class="fm-bar-track"><i style="width:${Math.max(2, (player[metric] || 0) / max * 100)}%"></i></div><b>${num(player[metric], metric === 'averageRating' ? 2 : 0)} ${label || ''}</b></div>`).join('')}</div>`;
  }
  function renderSquadStats() {
    const mostDecisive = [...players].sort((a, b) => b.contributions - a.contributions).slice(0, 8);
    const bestMetron = bestPlayers.slice(0, 8);
    const used = players.filter((player) => player.matches > 0);
    const metronValues = used.map((player) => player.metron).filter((value) => value != null);
    const averageMetron = metronValues.length ? metronValues.reduce((sum, value) => sum + value, 0) / metronValues.length : null;
    const totalAssists = used.reduce((sum, player) => sum + player.assists, 0);
    const totalHdm = used.reduce((sum, player) => sum + player.hdm, 0);
    return `<div class="fm-grid"><div class="fm-col-6">${panel('Classement Metron', bars(bestMetron, 'metron'), info('Note Metron', 'Note déjà calculée et publiée par Metron 1.0.1. Five Manager l’affiche sans la recalculer.'))}</div><div class="fm-col-6">${panel('Contributions offensives', bars(mostDecisive, 'contributions'), info('Contributions', 'Somme des buts et passes décisives recensés sur la saison actuelle.'))}</div><div class="fm-col-12">${panel('Synthèse', `<div class="fm-kpis">${kpi('Joueurs utilisés', used.length, `${players.length} dans l’effectif`)}${kpi('Metron moyen', num(averageMetron, 1), `${metronValues.length} joueurs notés`)}${kpi('Buts marqués', num(CURRENT.goalsFor, 0), `${num(CURRENT.goalsForPerMatch, 2)} / match`, 'positive')}${kpi('Passes recensées', totalAssists, 'saison actuelle')}${kpi('Distinctions HDM', totalHdm, 'saison actuelle')}${kpi('Matchs', num(CURRENT.matchesPlayed, 0), `${CURRENT.wins} V · ${CURRENT.draws} N · ${CURRENT.losses} D`)}${kpi('Différentiel', `${CURRENT.goalDifference > 0 ? '+' : ''}${num(CURRENT.goalDifference, 0)}`, `${num(CURRENT.averageGoalDifference, 2)} / match`, CURRENT.goalDifference >= 0 ? 'positive' : 'negative')}${kpi('Série en cours', `${CURRENT.streaks?.wins?.count || 0} V`, 'victoires consécutives')}</div>`)}</div></div>`;
  }
  function renderSquad() {
    if (state.sub === 'hierarchy') return renderHierarchy();
    if (state.sub === 'depth') return renderDepth();
    if (state.sub === 'stats') return renderSquadStats();
    return renderRoster();
  }

  function scoreForMode(player, mode) {
    if (mode === 'creation') return player.creation ?? -1;
    if (mode === 'finishing') return player.finishing ?? -1;
    if (mode === 'defensive') return player.defensive ?? -1;
    if (mode === 'collective') return (player.contributionsPerGame || 0) * 4 + (player.metron || 0);
    return player.metron ?? -1;
  }
  function suggestLineup(mode = state.mode) {
    const used = new Set();
    state.lineup = FORMATIONS[state.formation].map((slot) => {
      const selected = [...players].filter((p) => slot.accepts.includes(p.position) && !used.has(p.id)).sort((a, b) => scoreForMode(b, mode) - scoreForMode(a, mode))[0]
        || [...players].filter((p) => !used.has(p.id)).sort((a, b) => scoreForMode(b, mode) - scoreForMode(a, mode))[0];
      if (selected) used.add(selected.id);
      return selected?.id || null;
    });
  }
  function normalizedLineup() {
    const length = FORMATIONS[state.formation].length;
    state.lineup = state.lineup.slice(0, length);
    while (state.lineup.length < length) state.lineup.push(null);
    return state.lineup;
  }
  function relationLines(slots) {
    const found = new Map();
    const selected = slots.map((slot, index) => ({ slot, index, player: playerMap.get(state.lineup[index]) })).filter((item) => item.player);
    selected.forEach((source) => {
      const relations = [
        ['bestWinningPartner', 'positive'], ['bestOffensivePartner', 'creative'], ['worstLosingPartner', 'negative'], ['worstOffensivePartner', 'negative'],
      ];
      relations.forEach(([key, tone]) => {
        const targetId = source.player.collective?.[key]?.playerId;
        const target = selected.find((item) => item.player.id === targetId);
        if (!target || target.index === source.index) return;
        const pair = [source.player.id, target.player.id].sort().join('|');
        if (!found.has(pair) || tone === 'negative') found.set(pair, { source, target, tone, detail: source.player.collective[key] });
      });
    });
    return [...found.values()];
  }
  function renderLineup() {
    if (!state.lineup.length) suggestLineup();
    const slots = FORMATIONS[state.formation]; normalizedLineup();
    const relations = relationLines(slots);
    const selectedIds = new Set(state.lineup.filter(Boolean));
    const available = players.filter((player) => !selectedIds.has(player.id)).sort((a, b) => scoreForMode(b, state.mode) - scoreForMode(a, state.mode));
    const svg = relations.map(({ source, target, tone, detail }) => `<line class="${tone}" x1="${source.slot.x}%" y1="${source.slot.y}%" x2="${target.slot.x}%" y2="${target.slot.y}%"><title>${esc(source.player.name)} + ${esc(target.player.name)} · ${num(detail?.matchesTogether, 0)} matchs ensemble</title></line>`).join('');
    const slotHTML = slots.map((slot, index) => {
      const player = playerMap.get(state.lineup[index]);
      return `<div class="fm-slot${player ? ' is-filled' : ''}" data-slot="${index}" style="left:${slot.x}%;top:${slot.y}%" tabindex="0"><small>${slot.role}</small>${player ? `<strong>${playerButton(player)}</strong><div class="fm-slot-actions">${rating(player.metron)}<button type="button" data-remove-slot="${index}" aria-label="Retirer ${esc(player.name)}">×</button></div>` : '<strong>Déposer un joueur</strong>'}</div>`;
    }).join('');
    return `<div class="fm-lineup-layout"><section class="fm-panel fm-pitch-panel"><div class="fm-pitch-toolbar"><div class="fm-filters" style="margin:0"><select data-formation aria-label="Formation">${Object.keys(FORMATIONS).map((value) => `<option${state.formation === value ? ' selected' : ''}>${value}</option>`).join('')}</select><select data-mode aria-label="Orientation statistique"><option value="balanced"${state.mode === 'balanced' ? ' selected' : ''}>Équilibré · Metron</option><option value="creation"${state.mode === 'creation' ? ' selected' : ''}>Création</option><option value="finishing"${state.mode === 'finishing' ? ' selected' : ''}>Finition</option><option value="defensive"${state.mode === 'defensive' ? ' selected' : ''}>Défensif</option><option value="collective"${state.mode === 'collective' ? ' selected' : ''}>Impact collectif</option></select></div><div class="fm-actions"><button class="fm-button" data-suggest>Proposer</button><button class="fm-button" data-reset-lineup>Vider</button></div></div><div class="fm-pitch" data-pitch><svg class="fm-relations" viewBox="0 0 100 100" preserveAspectRatio="none">${svg}</svg>${slotHTML}</div><div class="fm-legend"><span><i class="positive"></i>Résultats communs favorables</span><span><i class="creative"></i>Production offensive</span><span><i class="negative"></i>Point de vigilance</span>${info('Relations', 'Les traits reprennent uniquement les associations collectives déjà calculées dans le Performance Hub. Elles décrivent des résultats observés, pas une compatibilité humaine absolue.')}</div>${relations.length ? `<div class="fm-actions" style="margin-top:8px">${relations.map((relation, index) => `<button class="fm-button" data-relation="${index}">${esc(relation.source.player.name)} + ${esc(relation.target.player.name)}</button>`).join('')}</div>` : '<div class="fm-callout" style="margin-top:8px">Aucune relation collective exploitable entre les cinq joueurs actuellement placés.</div>'}<div class="fm-actions" style="margin-top:10px"><button class="fm-button is-primary" data-save-lineup>Enregistrer sur cet appareil</button><button class="fm-button" data-go="match" data-sub="preparation">Préparer le match</button><button class="fm-button" disabled title="Les compositions complètes par match ne sont pas disponibles">Composition la plus utilisée</button><button class="fm-button" disabled title="Les compositions complètes par match ne sont pas disponibles">Composition la plus performante</button></div></section><aside class="fm-panel"><header class="fm-panel-head"><h2>Effectif disponible à sélectionner</h2><small>${available.length} joueurs</small></header><div class="fm-roster">${available.map((player) => `<button type="button" class="fm-roster-item" draggable="true" data-drag-player="${player.id}"><span><strong>${esc(player.name)}</strong><small>${ROLE_LABELS[player.position]} · ${player.matches} matchs</small></span><span>${player.goals} B · ${player.assists} P</span>${rating(player.metron)}</button>`).join('')}</div><div class="fm-panel-body"><div class="fm-callout"><b>Glisser-déposer ou toucher.</b> Sur mobile, touchez un joueur puis la case souhaitée.</div></div></aside></div>`;
  }

  function renderMatchOverview() {
    const scorer = [...players].sort((a, b) => b.goals - a.goals)[0];
    const passer = [...players].sort((a, b) => b.assists - a.assists)[0];
    const metronValues = players.map((player) => player.metron).filter((value) => value != null);
    const metronAverage = metronValues.length ? metronValues.reduce((sum, value) => sum + value, 0) / metronValues.length : null;
    return `<div class="fm-grid"><div class="fm-col-12">${panel('Prochaine rencontre', empty('À confirmer', 'Le calendrier public ne contient pas encore de prochaine rencontre suffisamment fiable. Compétition, adversaire, date, heure, lieu et confrontations restent donc indisponibles.'), info('Donnée manquante', 'Five Manager attend une rencontre future synchronisée et fiable avant d’afficher une affiche.'))}</div><div class="fm-col-7">${panel('Dernière rencontre', latestFixture ? `<div class="fm-match-hero"><div class="fm-team"><img src="../logo-lykos-intro-carre-2026.png" alt=""><strong>Lykos FC</strong></div><div class="fm-score"><strong>${latestFixture.scoreFor}–${latestFixture.scoreAgainst}</strong><small>${dateFR(latestFixture.date)} · ${fixtureResult(latestFixture)}</small></div><div class="fm-team"><div class="fm-brand-placeholder" style="margin:auto">?</div><strong>${esc(latestFixture.opponent)}</strong></div></div>` : empty('Aucun match', 'Aucun résultat disponible.'))}</div><div class="fm-col-5">${panel('Repères de forme', `${formHTML()}<div class="fm-kpis" style="margin-top:14px">${kpi('Victoires', num(CURRENT.wins, 0), `${num(CURRENT.winRate, 1)} %`, 'positive')}${kpi('Défaites', num(CURRENT.losses, 0), 'saison actuelle', 'negative')}</div>`)}</div><div class="fm-col-12">${panel('Repères de la saison', `<div class="fm-kpis">${kpi('Meilleur buteur', scorer ? scorer.name : '—', `${scorer?.goals || 0} buts`)}${kpi('Meilleur passeur', passer ? passer.name : '—', `${passer?.assists || 0} passes`)}${kpi('Metron moyen', num(metronAverage, 1), `${metronValues.length} joueurs notés`)}${kpi('Indisponibles', '—', 'source non branchée')}</div>`)}</div></div>`;
  }
  function renderMatchGroup() {
    if (!state.lineup.length) suggestLineup();
    if (!state.group.length) state.group = state.lineup.filter(Boolean);
    const selected = players.filter((player) => state.group.includes(player.id));
    const available = players.filter((player) => !state.group.includes(player.id));
    return `<div class="fm-grid"><div class="fm-col-6">${panel('Sélectionnés', `<ul class="fm-list">${selected.map((player) => `<li><i></i><div><strong>${playerButton(player)}</strong><small>${ROLE_LABELS[player.position]} · disponibilité à confirmer</small></div><button class="fm-button" data-group-toggle="${player.id}">Retirer</button></li>`).join('') || '<li><i></i><div><strong>Aucun joueur</strong><small>Ajoutez des joueurs depuis la liste disponible.</small></div></li>'}</ul><div class="fm-actions" style="margin-top:10px"><button class="fm-button is-primary" data-save-group>Valider le groupe</button><button class="fm-button" data-go="lineup">Préparer le cinq</button></div>`)}</div><div class="fm-col-6">${panel('Disponibles à sélectionner', `<ul class="fm-list">${available.map((player) => `<li><i></i><div><strong>${playerButton(player)}</strong><small>${ROLE_LABELS[player.position]} · état médical non renseigné</small></div><button class="fm-button" data-group-toggle="${player.id}">Ajouter</button></li>`).join('')}</ul>`)}</div><div class="fm-col-12">${panel('État des confirmations', `<div class="fm-kpis">${kpi('Sélectionnés', selected.length, 'groupe local')}${kpi('Disponibilités', '—', 'à confirmer')}${kpi('Incertains', '—', 'à confirmer')}${kpi('Absents', '—', 'à confirmer')}</div>`)}</div></div>`;
  }
  function renderPreparation() {
    return `<div class="fm-grid"><div class="fm-col-8">${panel('Préparation de match', `<div class="fm-callout" data-tone="warning"><b>Le contexte de la prochaine rencontre n’est pas encore connu.</b> Les actions dépendantes de l’adversaire restent désactivées pour ne pas fabriquer d’analyse.</div><ul class="fm-list" style="margin-top:10px"><li><i></i><div><strong>Valider les disponibilités</strong><small>À contrôler depuis la source de présence.</small></div><b>À faire</b></li><li><i></i><div><strong>Fixer le cinq de départ</strong><small>La composition locale peut déjà être préparée.</small></div><button class="fm-button" data-go="lineup">Ouvrir</button></li><li><i></i><div><strong>Analyser l’adversaire</strong><small>Nécessite une prochaine rencontre identifiée.</small></div><button class="fm-button" disabled title="Adversaire inconnu">Indisponible</button></li><li><i></i><div><strong>Publier une convocation</strong><small>Aucune connexion d’écriture n’est activée ici.</small></div><button class="fm-button" disabled title="Action externe non connectée">Indisponible</button></li></ul>`)}</div><div class="fm-col-4">${panel('Regards eStaff', `<ul class="fm-list"><li><i></i><div><strong>Informations de Victor</strong><small>« Les ${players.length} disponibilités doivent être confirmées avant la sélection. »</small></div><button class="fm-info" data-info-title="Informations de Victor" data-info="Constat : aucune source de disponibilité fiable n’est branchée. Conséquence : aucun joueur n’est déclaré disponible par défaut.">i</button></li><li><i></i><div><strong>Analyse de Giannis</strong><small>« La forme collective est positive, avec un échantillon encore court. »</small></div><button class="fm-info" data-info-title="Analyse de Giannis" data-info="La note de forme publiée est ${num(CURRENT.form?.value, 1)} sur ${CURRENT.form?.matchCount || 0} matchs, avec ${num(CURRENT.winRate, 1)} % de victoires.">i</button></li><li><i></i><div><strong>Avis de Léonard</strong><small>« Un cinq peut déjà être préparé à partir des rôles et de Metron. »</small></div><button class="fm-info" data-info-title="Avis de Léonard" data-info="La proposition équilibre les postes officiels puis classe les joueurs selon la note Metron publiée. Elle reste modifiable par le coach.">i</button></li><li><i></i><div><strong>Rapport de Nadir</strong><small>Vidéo du prochain adversaire non disponible.</small></div><button class="fm-info" data-info-title="Rapport de Nadir" data-info="Aucun adversaire futur ni document vidéo associé n’est disponible dans la source publique.">i</button></li></ul><a class="fm-button" href="../estaff/">Ouvrir l’eStaff</a>`)}</div></div>`;
  }
  function renderPostMatch() {
    if (!latestFixture) return panel('Après-match', empty('Aucun match disponible', 'Aucun débrief fiable ne peut être affiché.'));
    const seasonPoint = TEAM.seasons?.find((season) => season.current)?.series?.find((match) => match.eventId === latestFixture.eventId);
    return `<div class="fm-grid"><div class="fm-col-7">${panel('Résultat', `<div class="fm-status-strip" data-tone="${latestFixture.scoreFor > latestFixture.scoreAgainst ? 'positive' : 'negative'}"><strong>${dateFR(latestFixture.date)} · ${esc(latestFixture.opponent)}</strong><span>${fixtureResult(latestFixture)}</span></div><div class="fm-match-hero"><div class="fm-team"><img src="../logo-lykos-intro-carre-2026.png" alt=""><strong>Lykos FC</strong></div><div class="fm-score"><strong>${latestFixture.scoreFor}–${latestFixture.scoreAgainst}</strong><small>écart ${latestFixture.difference > 0 ? '+' : ''}${latestFixture.difference}</small></div><div class="fm-team"><div class="fm-brand-placeholder" style="margin:auto">?</div><strong>${esc(latestFixture.opponent)}</strong></div></div>`)}</div><div class="fm-col-5">${panel('Lecture disponible', `<div class="fm-kpis">${kpi('Forme du match', num(seasonPoint?.teamForm, 1), 'note collective', seasonPoint?.teamForm >= 60 ? 'positive' : 'negative')}${kpi('Note joueurs', num(seasonPoint?.formTrace?.playerGradeAverage, 2), `${num(seasonPoint?.formTrace?.playerGradeCount, 0)} notes`)}</div><ul class="fm-list" style="margin-top:10px"><li><i></i><div><strong>Note de l’événement</strong><small>${num(seasonPoint?.formTrace?.eventRatingVoteCount, 0)} vote recensé</small></div><b>${num(seasonPoint?.formTrace?.eventRatingAverage, 1)}/6</b></li><li><i></i><div><strong>Difficulté adverse</strong><small>${esc(seasonPoint?.formTrace?.opponentDifficulty?.policy || 'non renseignée')}</small></div><b>${num(seasonPoint?.formTrace?.opponentDifficulty?.value, 1)}</b></li></ul>`)}</div><div class="fm-col-6">${panel('Analyse des joueurs', empty('Détail individuel indisponible', 'La source publique ne relie pas encore les buteurs, passeurs et notes individuelles à cette rencontre précise. Les statistiques de période ne sont pas présentées comme des statistiques du match.'))}</div><div class="fm-col-6">${panel('Rapport de Nadir', empty('Aucune séquence vidéo reliée', 'Nadir ne peut produire un rapport après-match vérifiable sans vidéo ou compte rendu sourcé pour cette rencontre.'))}</div></div>`;
  }
  function renderMatch() {
    if (state.sub === 'group') return renderMatchGroup();
    if (state.sub === 'preparation') return renderPreparation();
    if (state.sub === 'postmatch') return renderPostMatch();
    return renderMatchOverview();
  }

  function reportSummary() {
    return `<div class="fm-grid"><div class="fm-col-6">${panel('Qualités', `<ul class="fm-list"><li data-tone="positive"><i></i><div><strong>Efficacité au résultat</strong><small>${CURRENT.wins} victoires sur ${CURRENT.matchesPlayed} matchs.</small></div><b>${num(CURRENT.winRate, 1)} %</b></li><li data-tone="positive"><i></i><div><strong>Différence de buts</strong><small>Solde de la saison actuelle.</small></div><b>+${num(CURRENT.goalDifference, 0)}</b></li><li data-tone="positive"><i></i><div><strong>Production moyenne</strong><small>Buts marqués par rencontre.</small></div><b>${num(CURRENT.goalsForPerMatch, 2)}</b></li></ul>`)}</div><div class="fm-col-6">${panel('Vigilances', `<ul class="fm-list"><li data-tone="negative"><i></i><div><strong>Buts encaissés</strong><small>Moyenne par rencontre.</small></div><b>${num(CURRENT.goalsAgainstPerMatch, 2)}</b></li><li><i></i><div><strong>Échantillon</strong><small>Lecture provisoire en début de saison.</small></div><b>${CURRENT.matchesPlayed}</b></li><li><i></i><div><strong>État physique</strong><small>Aucune donnée médicale vérifiée.</small></div><b>Inconnu</b></li></ul>`)}</div></div>`;
  }
  function reportDynamics() {
    return panel('Dynamiques observées', `<div class="fm-table-wrap"><table class="fm-table" style="min-width:650px"><thead><tr><th>Domaine</th><th>Évaluation</th><th style="text-align:left">Raison observable</th></tr></thead><tbody><tr><td>Résultats</td><td>${rating(CURRENT.form?.value)}</td><td style="text-align:left">${CURRENT.wins} victoires, ${CURRENT.draws} nul et ${CURRENT.losses} défaite.</td></tr><tr><td>Attaque</td><td>${rating(Math.min(99, CURRENT.goalsForPerMatch * 4))}</td><td style="text-align:left">${num(CURRENT.goalsForPerMatch, 2)} buts marqués par match.</td></tr><tr><td>Défense</td><td>${rating(Math.max(1, 99 - CURRENT.goalsAgainstPerMatch * 5))}</td><td style="text-align:left">${num(CURRENT.goalsAgainstPerMatch, 2)} buts encaissés par match.</td></tr><tr><td>Fiabilité de lecture</td><td>${rating(Math.min(99, CURRENT.matchesPlayed * 12))}</td><td style="text-align:left">Seulement ${CURRENT.matchesPlayed} matchs recensés : tendance encore volatile.</td></tr></tbody></table></div>`, info('Dynamiques', 'Ces appréciations résument des résultats observés. Elles ne prétendent pas mesurer le moral, la loyauté ou la psychologie du groupe.'));
  }
  function reportCollective() {
    const pairs = [];
    players.forEach((player) => {
      const rel = player.collective?.bestWinningPartner;
      if (!rel?.playerId || !playerMap.has(rel.playerId)) return;
      const key = [player.id, rel.playerId].sort().join('|');
      if (!pairs.some((pair) => pair.key === key)) pairs.push({ key, a: player, b: playerMap.get(rel.playerId), ...rel });
    });
    pairs.sort((a, b) => b.matchesTogether - a.matchesTogether || b.winRate - a.winRate);
    return panel('Associations observées', `<div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Association</th><th>Matchs</th><th>Victoires</th><th>Taux</th><th>Lecture</th></tr></thead><tbody>${pairs.slice(0, 12).map((pair) => `<tr><td>${playerButton(pair.a)} + ${playerButton(pair.b)}</td><td>${pair.matchesTogether}</td><td>${pair.winsTogether}</td><td>${num(pair.winRate, 1)} %</td><td>Résultats communs observés</td></tr>`).join('')}</tbody></table></div>`, info('Associations', 'Les associations décrivent les résultats obtenus lorsque deux joueurs étaient présents ensemble. Elles ne constituent pas une mesure de compatibilité interpersonnelle.'));
  }
  function renderReport() {
    if (state.sub === 'depth') return renderDepth();
    if (state.sub === 'stats') return renderSquadStats();
    if (state.sub === 'dynamics') return reportDynamics();
    if (state.sub === 'collective') return reportCollective();
    return reportSummary();
  }

  function availabilityTable(title, message) {
    return panel(title, `<div class="fm-callout" data-tone="warning"><b>Source non disponible.</b> ${message}</div><div class="fm-table-wrap" style="margin-top:10px"><table class="fm-table" style="min-width:620px"><thead><tr><th>Joueur</th><th>Poste</th><th>État</th><th>Dernière information fiable</th></tr></thead><tbody>${players.map((player) => `<tr><td>${playerButton(player)}</td><td>${ROLE_LABELS[player.position]}</td><td>Non renseigné</td><td>À confirmer</td></tr>`).join('')}</tbody></table></div>`);
  }
  function renderAvailability() {
    if (state.sub === 'absences') return availabilityTable('Absences', 'Aucune absence n’est déclarée sans preuve de présence ou donnée médicale vérifiée.');
    if (state.sub === 'load') return availabilityTable('Charge', 'Le temps de jeu et la charge d’entraînement ne sont pas recensés de façon exploitable.');
    if (state.sub === 'returns') return availabilityTable('Retours', 'Aucune date de retour ne peut être affichée sans blessure et échéance sourcées.');
    return `<div class="fm-grid"><div class="fm-col-4">${panel('État général', `<div class="fm-kpis">${kpi('Effectif', players.length, 'joueurs actuels')}${kpi('Confirmés', '0', 'source absente')}${kpi('À confirmer', players.length, 'aucune supposition')}${kpi('Blessures', '—', 'non renseignées')}</div>`)}</div><div class="fm-col-8">${availabilityTable('Suivi individuel', 'Five Manager ne transforme jamais une absence de donnée en disponibilité. Les 19 états restent à confirmer.')}</div></div>`;
  }

  function allTimePlayers() {
    return CURRENT_PLAYERS.map(([id, fallback, position]) => {
      const raw = ALL_TIME_STATS[id]; if (!raw) return null;
      return { id, name: fallback, position, matches: raw.primary?.matches || 0, goals: raw.primary?.goals || 0, assists: raw.primary?.assists || 0, hdm: raw.primary?.manOfTheMatch || 0, averageRating: raw.primary?.averageRating || null, metron: raw.performance?.overall ?? null };
    }).filter(Boolean);
  }
  function renderRecords() {
    const pool = Object.entries(ALL_TIME_STATS).map(([id, raw]) => ({ id, name: raw.playerName || playerMap.get(id)?.name || humanizePlayerId(id), matches: raw.primary?.matches || 0, goals: raw.primary?.goals || 0, assists: raw.primary?.assists || 0, hdm: raw.primary?.manOfTheMatch || 0, averageRating: raw.primary?.averageRating || null, metron: raw.performance?.overall ?? null }));
    const record = (metric, label, detail) => { const p = [...pool].sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1))[0]; return p ? `<article class="fm-record"><span>${label}</span><b>${num(p[metric], metric === 'averageRating' ? 2 : 0)}</b><small>${playerButton(p)} · ${detail}</small></article>` : ''; };
    const fixtures = Object.values(TEAM.periods?.alltime?.scoreDistribution || {}).flatMap((bucket) => bucket.fixtures || []);
    const biggestWin = [...fixtures].filter((match) => match.difference > 0).sort((a, b) => b.difference - a.difference)[0];
    const biggestLoss = [...fixtures].filter((match) => match.difference < 0).sort((a, b) => a.difference - b.difference)[0];
    const mostGoals = [...fixtures].sort((a, b) => b.scoreFor - a.scoreFor)[0];
    const all = TEAM.periods?.alltime || {};
    const matchRecord = (label, match, value) => match ? `<article class="fm-record"><span>${label}</span><b>${value}</b><small><button class="fm-player-link" data-match-detail="${esc(match.eventId)}">${dateFR(match.date)} · ${esc(match.opponent)}</button></small></article>` : '';
    return panel('Records all-time', `<div class="fm-records">${record('matches', 'Plus de matchs', 'depuis 2019')}${record('goals', 'Plus de buts', 'depuis 2019')}${record('assists', 'Plus de passes', 'depuis 2019')}${record('hdm', 'Plus de distinctions HDM', 'depuis 2019')}${record('averageRating', 'Meilleure note moyenne', 'moyenne publiée')}${record('metron', 'Meilleur niveau Metron', 'note publiée')}${matchRecord('Plus grosse victoire', biggestWin, `+${biggestWin?.difference}`)}${matchRecord('Plus lourde défaite', biggestLoss, biggestLoss?.difference)}${matchRecord('Record de buts équipe', mostGoals, mostGoals?.scoreFor)}<article class="fm-record"><span>Meilleure série de victoires</span><b>${all.streaks?.wins?.count || 0}</b><small>${dateFR(all.streaks?.wins?.startAt)} → ${dateFR(all.streaks?.wins?.endAt)}</small></article><article class="fm-record"><span>Plus longue invincibilité</span><b>${all.streaks?.unbeaten?.count || 0}</b><small>${dateFR(all.streaks?.unbeaten?.startAt)} → ${dateFR(all.streaks?.unbeaten?.endAt)}</small></article></div>`, info('Records', 'Records calculés à partir des données all-time actuellement publiées dans le Performance Hub. Les matchs conteneurs de tournoi ne sont pas ajoutés.'));
  }
  function renderSeasons() {
    return panel('Saisons recensées', `<div class="fm-table-wrap"><table class="fm-table" style="min-width:700px"><thead><tr><th>Saison</th><th>Matchs</th><th>Forme</th><th>Couverture événement</th><th>Couverture joueurs</th></tr></thead><tbody>${(TEAM.seasons || []).map((season) => `<tr><td>${esc(season.label)}</td><td>${season.matchCount}</td><td>${rating(season.form?.value)}</td><td>${num(season.form?.eventRatingCoverage, 0)} %</td><td>${num(season.form?.gradeCoverage, 0)} %</td></tr>`).join('')}</tbody></table></div>`);
  }
  function renderHistoryMatches() {
    const fixtures = Object.values(TEAM.periods?.alltime?.scoreDistribution || {}).flatMap((bucket) => bucket.fixtures || []).sort((a, b) => b.date.localeCompare(a.date));
    return panel('Matchs recensés', `<div class="fm-table-wrap"><table class="fm-table" style="min-width:700px"><thead><tr><th>Date</th><th>Adversaire</th><th>Score</th><th>Résultat</th><th>Détail</th></tr></thead><tbody>${fixtures.map((match) => `<tr><td>${dateFR(match.date)}</td><td>${esc(match.opponent)}</td><td>${match.scoreFor}–${match.scoreAgainst}</td><td>${fixtureResult(match)}</td><td><button class="fm-button" data-match-detail="${esc(match.eventId)}">Voir</button></td></tr>`).join('')}</tbody></table></div>`, `<small>${fixtures.length} matchs</small>`);
  }
  function renderHistory() {
    if (state.sub === 'seasons') return renderSeasons();
    if (state.sub === 'matches') return renderHistoryMatches();
    return renderRecords();
  }

  const STAFF = [
    ['Coordination', 'oscar', 'Oscar', 'Responsable du eStaff', 'Coordonne les missions, fixe les priorités et rassemble les conclusions de l’équipe.'],
    ['eSportif', 'leonard', 'Léonard', 'Conseiller sportif', 'Transforme les analyses de l’équipe en conseils utiles aux coaches.'],
    ['eSportif', 'victor', 'Victor', 'Gestion de l’effectif', 'Analyse les disponibilités et la couverture des postes du groupe.'],
    ['eSportif', 'giannis', 'Giannis', 'Analyste performance', 'Interprète les statistiques et les notes Metron avec leur contexte.'],
    ['eSportif', 'nadir', 'Nadir', 'Analyste vidéo', 'Étudie les matchs filmés et documente ses observations avec des séquences précises.'],
    ['eSportif', 'bastien', 'Bastien', 'Planification SportEasy', 'Prépare les calendriers, les résultats et les classements à valider.'],
    ['eOpérations', 'sophie', 'Sophie', 'Gestion administrative', 'Suit les dossiers du club et prépare les éléments administratifs à vérifier.'],
    ['eSupport', 'veronique', 'Véronique', 'Contrôle qualité', 'Contrôle les résultats et les corrections avant leur mise en service.'],
  ];
  function renderStaff() {
    const services = [...new Set(STAFF.map(([service]) => service))];
    return `<div class="fm-grid"><div class="fm-col-12">${panel('eStaff · équipe du club', `<div class="fm-callout"><b>Chaque agent est une personne.</b> Five Manager présente les collègues directement utiles au pilotage sportif. Le détail de leurs missions, preuves et états se consulte dans l’espace eStaff.</div>${services.map((service) => `<h2 style="margin:18px 0 8px;color:var(--gold);font-size:11px;text-transform:uppercase">${service}</h2><div class="fm-agent-grid">${STAFF.filter(([group]) => group === service).map(([, id, name, role, mission]) => `<article class="fm-agent"><img src="../estaff/assets/portraits/team/${id}.jpg" alt="Portrait de ${name}" loading="lazy"><div><h3>${name}</h3><span>${role}</span></div><p>${mission}</p><a href="../estaff/?agent=${id}">Voir sa page dans l’eStaff →</a></article>`).join('')}</div>`).join('')}<div class="fm-actions" style="margin-top:14px"><a class="fm-button is-primary" href="../estaff/">Rencontrer toute l’équipe eStaff</a></div>`)}</div></div>`;
  }

  function renderCurrent() {
    if (state.route === 'home') return renderHome();
    if (state.route === 'squad') return renderSquad();
    if (state.route === 'lineup') return renderLineup();
    if (state.route === 'match') return renderMatch();
    if (state.route === 'report') return renderReport();
    if (state.route === 'availability') return renderAvailability();
    if (state.route === 'history') return renderHistory();
    if (state.route === 'staff') return renderStaff();
    return renderHome();
  }
  function render() {
    const route = ROUTES[state.route] || ROUTES.home;
    $('[data-kicker]').textContent = route.kicker;
    $('[data-title]').textContent = route.title;
    $('[data-subtitle]').textContent = route.subtitle;
    $$('[data-route]').forEach((button) => button.setAttribute('aria-current', button.dataset.route === state.route ? 'page' : 'false'));
    if (route.tabs) {
      subnav.hidden = false;
      subnav.innerHTML = route.tabs.map(([key, label]) => `<button type="button" data-tab="${key}" aria-current="${state.sub === key ? 'page' : 'false'}">${label}</button>`).join('');
    } else { subnav.hidden = true; subnav.innerHTML = ''; }
    content.innerHTML = renderCurrent();
    document.title = `${route.title} · Five Manager · Lykos FC`;
  }
  function navigate(route, sub = null, push = true) {
    if (!ROUTES[route]) route = 'home';
    state.route = route; state.sub = sub || DEFAULT_TABS[route] || null;
    const hash = `#${state.route}${state.sub ? `/${state.sub}` : ''}`;
    if (push && location.hash !== hash) history.pushState(null, '', hash);
    render(); $('.fm-main')?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function loadHash() {
    const [route, sub] = location.hash.replace(/^#/, '').split('/');
    navigate(ROUTES[route] ? route : 'home', sub || null, false);
  }
  function assignPlayerToSlot(playerId, slotIndex) {
    const player = playerMap.get(playerId); const slot = FORMATIONS[state.formation][slotIndex];
    if (!player || !slot) return;
    const oldIndex = state.lineup.indexOf(playerId); if (oldIndex >= 0) state.lineup[oldIndex] = null;
    state.lineup[slotIndex] = playerId;
    if (!slot.accepts.includes(player.position)) toast(`${player.name} est placé hors de son poste principal.`);
    render();
  }

  document.addEventListener('click', (event) => {
    const routeButton = event.target.closest('[data-route]'); if (routeButton) return navigate(routeButton.dataset.route);
    const go = event.target.closest('[data-go]'); if (go) return navigate(go.dataset.go, go.dataset.sub || null);
    const tab = event.target.closest('[data-tab]'); if (tab) return navigate(state.route, tab.dataset.tab);
    const player = event.target.closest('[data-player]'); if (player) return openPlayer(player.dataset.player);
    const infoButton = event.target.closest('[data-info]'); if (infoButton) return showDialog(infoButton.dataset.infoTitle || 'Explication', `<p>${esc(infoButton.dataset.info)}</p>`);
    const close = event.target.closest('[data-dialog-close]'); if (close) return dialog.close();
    const sort = event.target.closest('[data-sort]'); if (sort) { if (state.sort === sort.dataset.sort) state.direction *= -1; else { state.sort = sort.dataset.sort; state.direction = sort.dataset.sort === 'name' ? 1 : -1; } return render(); }
    const remove = event.target.closest('[data-remove-slot]'); if (remove) { state.lineup[Number(remove.dataset.removeSlot)] = null; return render(); }
    const suggest = event.target.closest('[data-suggest]'); if (suggest) { suggestLineup(); render(); return toast('Cinq proposé à partir des données disponibles.'); }
    const reset = event.target.closest('[data-reset-lineup]'); if (reset) { state.lineup = FORMATIONS[state.formation].map(() => null); return render(); }
    const save = event.target.closest('[data-save-lineup]'); if (save) { localStorage.setItem('lykos_fm_lineup_v1', JSON.stringify({ formation: state.formation, lineup: state.lineup })); return toast('Composition enregistrée sur cet appareil.'); }
    const relationButton = event.target.closest('[data-relation]'); if (relationButton) {
      const slots = FORMATIONS[state.formation]; const relation = relationLines(slots)[Number(relationButton.dataset.relation)];
      if (relation) return showDialog(`${relation.source.player.name} + ${relation.target.player.name}`, `<dl><dt>Matchs ensemble</dt><dd>${num(relation.detail?.matchesTogether, 0)}</dd><dt>Victoires</dt><dd>${num(relation.detail?.winsTogether, 0)}</dd><dt>Nuls</dt><dd>${num(relation.detail?.drawsTogether, 0)}</dd><dt>Défaites</dt><dd>${num(relation.detail?.lossesTogether, 0)}</dd><dt>Taux de victoires</dt><dd>${num(relation.detail?.winRate, 1)} %</dd></dl><p>Relation observée dans les données COLLECTIF ; elle ne mesure pas une compatibilité personnelle.</p>`);
    }
    const groupToggle = event.target.closest('[data-group-toggle]'); if (groupToggle) {
      const id = groupToggle.dataset.groupToggle; state.group = state.group.includes(id) ? state.group.filter((value) => value !== id) : [...state.group, id]; return render();
    }
    const saveGroup = event.target.closest('[data-save-group]'); if (saveGroup) { localStorage.setItem('lykos_fm_group_v1', JSON.stringify(state.group)); return toast(`Groupe de ${state.group.length} joueurs enregistré sur cet appareil.`); }
    const dragPlayer = event.target.closest('[data-drag-player]'); if (dragPlayer && matchMedia('(pointer:coarse)').matches) { state.dragged = dragPlayer.dataset.dragPlayer; return toast('Joueur sélectionné : touchez maintenant une case du terrain.'); }
    const slot = event.target.closest('[data-slot]'); if (slot && state.dragged && !event.target.closest('[data-player],[data-remove-slot]')) { const id = state.dragged; state.dragged = null; return assignPlayerToSlot(id, Number(slot.dataset.slot)); }
    const matchDetail = event.target.closest('[data-match-detail]'); if (matchDetail) {
      const fixture = Object.values(TEAM.periods?.alltime?.scoreDistribution || {}).flatMap((bucket) => bucket.fixtures || []).find((item) => item.eventId === matchDetail.dataset.matchDetail);
      if (fixture) showDialog(`${dateFR(fixture.date)} · ${fixture.opponent}`, `<dl><dt>Score</dt><dd>Lykos FC ${fixture.scoreFor}–${fixture.scoreAgainst}</dd><dt>Résultat</dt><dd>${fixtureResult(fixture)}</dd><dt>Écart</dt><dd>${fixture.difference > 0 ? '+' : ''}${fixture.difference}</dd><dt>Identifiant source</dt><dd>${esc(fixture.eventId)}</dd></dl>`);
    }
  });
  document.addEventListener('input', (event) => { if (event.target.matches('[data-roster-search]')) { state.search = event.target.value; render(); const input = $('[data-roster-search]'); input?.focus(); input?.setSelectionRange(state.search.length, state.search.length); } });
  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-role-filter]')) { state.role = event.target.value; render(); }
    if (event.target.matches('[data-period-filter]')) { state.period = event.target.value; render(); }
    if (event.target.matches('[data-compare-filter]')) { state.comparePeriod = event.target.value; render(); }
    if (event.target.matches('[data-hierarchy-player]')) { state.hierarchy[event.target.dataset.hierarchyPlayer] = event.target.value; localStorage.setItem('lykos_fm_hierarchy_v1', JSON.stringify(state.hierarchy)); toast('Statut sportif local enregistré.'); }
    if (event.target.matches('[data-formation]')) { state.formation = event.target.value; state.lineup = []; suggestLineup(); render(); }
    if (event.target.matches('[data-mode]')) { state.mode = event.target.value; suggestLineup(); render(); }
  });
  document.addEventListener('dragstart', (event) => { const item = event.target.closest('[data-drag-player]'); if (item) { state.dragged = item.dataset.dragPlayer; event.dataTransfer?.setData('text/plain', state.dragged); } });
  document.addEventListener('dragover', (event) => { const slot = event.target.closest('[data-slot]'); if (slot) { event.preventDefault(); slot.classList.add('is-over'); } });
  document.addEventListener('dragleave', (event) => event.target.closest('[data-slot]')?.classList.remove('is-over'));
  document.addEventListener('drop', (event) => { const slot = event.target.closest('[data-slot]'); if (!slot) return; event.preventDefault(); slot.classList.remove('is-over'); const id = event.dataTransfer?.getData('text/plain') || state.dragged; state.dragged = null; assignPlayerToSlot(id, Number(slot.dataset.slot)); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  window.addEventListener('popstate', loadHash);
  window.addEventListener('hashchange', loadHash);

  $('[data-freshness]').textContent = formatFreshness();
  loadHash();
  const returning = safeJSON(sessionStorage.getItem('lykos_five_manager_return'), null);
  if (returning?.href === location.href && Number.isFinite(returning.scrollY)) requestAnimationFrame(() => window.scrollTo(0, returning.scrollY));
})();
