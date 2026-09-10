import {
  calculateAverage,
  calculateGoalDifference,
  calculateGoalsPerMatch,
  calculateLongestStreak,
  calculateWinRate,
  safeDivide,
} from "./statistics-calculations.mjs";

export class StatisticsValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "StatisticsValidationError";
    this.kind = "validation";
    this.details = details;
  }
}

const OUTCOMES = new Set(["victory", "tie", "defeat"]);
const EXCLUDED_SLUGS = new Set([
  "blue_cards",
  "blue_cards_strict_sum",
  "has_cancelled_sum",
  "has_skipped_sum",
  "playing_time",
  "playing_time_strict_sum",
  "presence",
  "red_cards",
  "red_cards_strict_sum",
  "white_cards",
  "white_cards_strict_sum",
  "yellow_cards",
  "yellow_cards_strict_sum",
]);

const PLAYER_ADDITIVE_METRICS = Object.freeze({
  matchesPlayed: "has_attended_strict_sum",
  wins: "player_match_outcome_victory_sum",
  draws: "player_match_outcome_tie_sum",
  losses: "player_match_outcome_defeat_sum",
  goals: "player_goals_strict_sum",
  assists: "player_assists_strict_sum",
  manOfMatch: "man_of_event_strict_sum",
});

function id(value, label) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) throw new StatisticsValidationError(`${label} invalide.`);
  return text;
}

function decimal(value, label, { nullable = true } = {}) {
  if (value === null || value === undefined || value === "") {
    if (nullable) return null;
    throw new StatisticsValidationError(`${label} est absent.`);
  }
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (!Number.isFinite(parsed)) throw new StatisticsValidationError(`${label} n'est pas numérique.`);
  return parsed;
}

function integer(value, label, options = {}) {
  const parsed = decimal(value, label, options);
  if (parsed === null) return null;
  if (!Number.isInteger(parsed)) throw new StatisticsValidationError(`${label} n'est pas un entier.`);
  return parsed;
}

function resultsMap(results, label) {
  if (!Array.isArray(results)) throw new StatisticsValidationError(`${label} est invalide.`);
  const map = new Map();
  for (const result of results) {
    const slug = String(result?.slug_name ?? "").trim();
    if (!slug) throw new StatisticsValidationError(`${label} contient un champ sans nom.`);
    if (map.has(slug)) throw new StatisticsValidationError(`${label} contient deux fois ${slug}.`);
    map.set(slug, result?.value ?? null);
  }
  return map;
}

function rawMetric(value, { field, endpoints = [], nullable = true, unit = null } = {}) {
  return {
    value,
    status: value === null ? "unavailable" : "available",
    unit,
    nullable,
    source: "SportEasy",
    sourceType: "raw",
    field,
    endpoints,
  };
}

function derivedMetric(value, { formula, dependencies, unit = null } = {}) {
  return {
    value,
    status: value === null ? "unavailable" : "available",
    unit,
    nullable: true,
    source: "Lykos",
    sourceType: "derived",
    formula,
    dependencies,
  };
}

function seasonOrderMap(seasons) {
  return new Map(seasons.map((season, index) => [String(season.sporteasyId ?? season.id), index]));
}

export function enrichPlayersRepository(playersRepository, evidence) {
  if (playersRepository?.metadata?.validationStatus !== "valid" || !Array.isArray(playersRepository.players)) {
    throw new StatisticsValidationError("Le référentiel joueurs n'est pas validé.");
  }
  const seasons = playersRepository.seasons;
  const order = seasonOrderMap(seasons);
  const players = new Map(playersRepository.players.map((player) => [String(player.sporteasyId), {
    ...player,
    seasonIds: [...player.seasonIds],
  }]));
  const addedHistoricalIds = [];

  for (const item of evidence) {
    const sporteasyId = id(item.sporteasyId, "Identifiant de joueur statistique");
    const seasonId = id(item.seasonId, "Identifiant de saison statistique");
    if (!order.has(seasonId)) {
      throw new StatisticsValidationError(`Le joueur ${sporteasyId} référence la saison inconnue ${seasonId}.`);
    }
    const displayName = String(item.displayName ?? "").trim().replace(/\s+/g, " ");
    if (!displayName) throw new StatisticsValidationError(`Le joueur statistique ${sporteasyId} n'a pas de nom.`);
    let player = players.get(sporteasyId);
    if (!player) {
      player = {
        sporteasyId,
        displayName,
        isCurrent: false,
        seasonIds: [],
        firstSeenSeasonId: null,
        lastSeenSeasonId: null,
        seasonMembershipStatus: "confirmed-from-statistics",
      };
      players.set(sporteasyId, player);
      addedHistoricalIds.push(sporteasyId);
    }
    if (!player.seasonIds.includes(seasonId)) player.seasonIds.push(seasonId);
    player.seasonIds.sort((left, right) => order.get(left) - order.get(right));
    player.firstSeenSeasonId = player.seasonIds[0] ?? null;
    player.lastSeenSeasonId = player.seasonIds.at(-1) ?? null;
    if (!player.isCurrent && player.seasonIds.length) player.seasonMembershipStatus = "confirmed-from-statistics";
  }

  const finalPlayers = [...players.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "fr", { sensitivity: "base" }),
  );
  const currentPlayerCount = finalPlayers.filter((player) => player.isCurrent).length;
  const allHistoricalIdsAddedFromStatistics = [...new Set([
    ...(playersRepository.metadata?.historicalPlayersAddedFromStatistics ?? []),
    ...addedHistoricalIds,
  ])].sort();
  return {
    ...playersRepository,
    players: finalPlayers,
    metadata: {
      ...playersRepository.metadata,
      totalPlayerCount: finalPlayers.length,
      historicalPlayerCount: finalPlayers.length,
      currentPlayerCount,
      formerPlayerCount: finalPlayers.length - currentPlayerCount,
      historicalPlayersAddedFromStatistics: allHistoricalIdsAddedFromStatistics,
    },
  };
}

function normalizePlayerCategoryCaptures(captures, seasonsBySlug) {
  const rows = [];
  const evidence = [];
  for (const capture of captures) {
    const payload = capture.payload;
    const seasonSlug = String(payload?.category_season?.season_slug_name ?? "");
    const seasonId = seasonsBySlug.get(seasonSlug);
    if (!seasonId) throw new StatisticsValidationError(`Saison statistique inconnue : ${seasonSlug}.`);
    if (!Array.isArray(payload?.players)) throw new StatisticsValidationError("Liste de joueurs statistiques invalide.");
    const seen = new Set();
    for (const entry of payload.players) {
      const sporteasyId = id(entry?.player?.id, "Identifiant joueur");
      if (seen.has(sporteasyId)) {
        throw new StatisticsValidationError(
          `Le joueur ${sporteasyId} est dupliqué dans la catégorie ${capture.categoryId}.`,
        );
      }
      seen.add(sporteasyId);
      evidence.push({
        sporteasyId,
        displayName: entry.player.full_name,
        seasonId,
      });
      const values = resultsMap(entry.results, `Statistiques du joueur ${sporteasyId}`);
      const metrics = {};
      for (const [key, slug] of Object.entries(PLAYER_ADDITIVE_METRICS)) {
        metrics[key] = values.has(slug) ? integer(values.get(slug), slug) : null;
      }
      metrics.gradeAverage = values.has("player_grade_reduce_avg")
        ? decimal(values.get("player_grade_reduce_avg"), "Note moyenne")
        : null;
      metrics.gradeMin = values.has("player_grade_min")
        ? decimal(values.get("player_grade_min"), "Note minimale")
        : null;
      metrics.gradeMax = values.has("player_grade_max")
        ? decimal(values.get("player_grade_max"), "Note maximale")
        : null;
      metrics.challengePoints = values.has("player_challenge_points_sum")
        ? integer(values.get("player_challenge_points_sum"), "Points de challenge")
        : null;
      rows.push({
        sporteasyId,
        seasonId,
        categoryId: String(capture.categoryId),
        endpoint: capture.endpoint,
        metrics,
      });
    }
  }
  return { rows, evidence };
}

function normalizeGlobalCaptures(captures, seasonsBySlug) {
  return captures.map((capture) => {
    const payload = capture.payload;
    const seasonSlug = String(payload?.category_season?.season_slug_name ?? "");
    const seasonId = seasonsBySlug.get(seasonSlug);
    if (!seasonId) throw new StatisticsValidationError(`Saison globale inconnue : ${seasonSlug}.`);
    const charts = payload?.charts_data;
    if (!charts || typeof charts !== "object") {
      throw new StatisticsValidationError(`Statistiques globales invalides pour ${capture.categoryId}.`);
    }
    const matchesPlayed = integer(charts.num_played_events, "Nombre de matchs", { nullable: false });
    const get = (group, slug) =>
      Object.hasOwn(charts[group] ?? {}, slug) ? integer(charts[group][slug], slug) : null;
    const metrics = {
      matchesPlayed,
      wins: get("outcomes", "match_outcome_victory_sum"),
      draws: get("outcomes", "match_outcome_tie_sum"),
      losses: get("outcomes", "match_outcome_defeat_sum"),
      goalsFor: get("scores", "score_for_sum"),
      goalsAgainst: get("scores", "score_against_sum"),
    };
    if (
      matchesPlayed > 0 &&
      [metrics.wins, metrics.draws, metrics.losses].every(Number.isInteger) &&
      matchesPlayed !== metrics.wins + metrics.draws + metrics.losses
    ) {
      throw new StatisticsValidationError(`Bilan global incohérent pour ${capture.categoryId}.`);
    }
    return {
      seasonId,
      categoryId: String(capture.categoryId),
      categorySlug: payload.category_season?.slug_name ?? null,
      categoryType: payload.category_season?.type ?? capture.categoryType,
      endpoint: capture.endpoint,
      metrics,
    };
  });
}

function officialCapture(captures, { scope, seasonId = null, kind }) {
  const matches = captures.filter(
    (capture) =>
      capture.scope === scope &&
      capture.kind === kind &&
      (scope === "allTime" || String(capture.seasonId) === String(seasonId)),
  );
  if (matches.length !== 1) {
    throw new StatisticsValidationError(
      `SportEasy doit fournir exactement une vue officielle ${kind} pour ${scope === "allTime" ? "All-time" : `la saison ${seasonId}`}.`,
    );
  }
  return matches[0];
}

function normalizeOfficialPlayers(capture) {
  const payload = capture?.payload;
  if (payload?.category_season?.slug_name !== "all" || !Array.isArray(payload?.players)) {
    throw new StatisticsValidationError("La vue officielle « Tous les matchs » des joueurs est invalide.");
  }
  const players = {};
  const seen = new Set();
  for (const entry of payload.players) {
    const sporteasyId = id(entry?.player?.id, "Identifiant joueur officiel");
    if (seen.has(sporteasyId)) {
      throw new StatisticsValidationError(
        `Le joueur ${sporteasyId} est dupliqué dans la vue officielle « Tous les matchs ».`,
      );
    }
    seen.add(sporteasyId);
    const values = resultsMap(entry.results, `Vue officielle du joueur ${sporteasyId}`);
    const readInteger = (slug) => values.has(slug) ? integer(values.get(slug), slug) : null;
    const readDecimal = (slug, label) => values.has(slug) ? decimal(values.get(slug), label) : null;
    const matchesPlayed = readInteger("has_attended_strict_sum");
    const goals = readInteger("player_goals_strict_sum");
    const assists = readInteger("player_assists_strict_sum");
    const manOfMatch = readInteger("man_of_event_strict_sum");
    const raw = (value, field) => rawMetric(value, {
      field,
      endpoints: [capture.endpoint],
    });
    const challengePoints = readInteger("player_challenge_points_sum");
    players[sporteasyId] = {
      sporteasyId,
      metrics: {
        matchesPlayed: raw(matchesPlayed, "has_attended_strict_sum"),
        wins: raw(readInteger("player_match_outcome_victory_sum"), "player_match_outcome_victory_sum"),
        draws: raw(readInteger("player_match_outcome_tie_sum"), "player_match_outcome_tie_sum"),
        losses: raw(readInteger("player_match_outcome_defeat_sum"), "player_match_outcome_defeat_sum"),
        goals: raw(goals, "player_goals_strict_sum"),
        assists: raw(assists, "player_assists_strict_sum"),
        manOfMatch: raw(manOfMatch, "man_of_event_strict_sum"),
        gradeAverage: raw(readDecimal("player_grade_reduce_avg", "Note moyenne"), "player_grade_reduce_avg"),
        gradeMin: raw(readDecimal("player_grade_min", "Note minimale"), "player_grade_min"),
        gradeMax: raw(readDecimal("player_grade_max", "Note maximale"), "player_grade_max"),
        goalsPerMatch: derivedMetric(
          goals === null || matchesPlayed === null ? null : calculateGoalsPerMatch(goals, matchesPlayed),
          { formula: "goals / matchesPlayed", dependencies: ["goals", "matchesPlayed"] },
        ),
        assistsPerMatch: derivedMetric(
          assists === null || matchesPlayed === null ? null : safeDivide(assists, matchesPlayed, 2),
          { formula: "assists / matchesPlayed", dependencies: ["assists", "matchesPlayed"] },
        ),
        manOfMatchPerMatch: derivedMetric(
          manOfMatch === null || matchesPlayed === null ? null : safeDivide(manOfMatch, matchesPlayed, 2),
          { formula: "manOfMatch / matchesPlayed", dependencies: ["manOfMatch", "matchesPlayed"] },
        ),
      },
      customMetrics: challengePoints === null
        ? []
        : [{
            key: "player_challenge_points_sum",
            label: "Points de challenge",
            ...raw(challengePoints, "player_challenge_points_sum"),
          }],
    };
  }
  return players;
}

function normalizeOfficialTeam(capture, events) {
  const payload = capture?.payload;
  if (payload?.category_season?.slug_name !== "all" || !payload?.charts_data) {
    throw new StatisticsValidationError("La vue officielle « Tous les matchs » de l'équipe est invalide.");
  }
  const charts = payload.charts_data;
  const read = (group, slug) =>
    Object.hasOwn(charts[group] ?? {}, slug) ? integer(charts[group][slug], slug) : null;
  const values = {
    matchesPlayed: integer(charts.num_played_events, "Nombre officiel de matchs", { nullable: false }),
    wins: read("outcomes", "match_outcome_victory_sum"),
    draws: read("outcomes", "match_outcome_tie_sum"),
    losses: read("outcomes", "match_outcome_defeat_sum"),
    goalsFor: read("scores", "score_for_sum"),
    goalsAgainst: read("scores", "score_against_sum"),
  };
  if (
    [values.wins, values.draws, values.losses].every(Number.isInteger) &&
    values.matchesPlayed !== values.wins + values.draws + values.losses
  ) {
    throw new StatisticsValidationError("Le bilan officiel « Tous les matchs » est incohérent.");
  }
  const raw = (value, field) => rawMetric(value, { field, endpoints: [capture.endpoint] });
  const audit = aggregateTeam(events);
  return {
    metrics: {
      matchesPlayed: raw(values.matchesPlayed, "charts_data.num_played_events"),
      wins: raw(values.wins, "charts_data.outcomes.match_outcome_victory_sum"),
      draws: raw(values.draws, "charts_data.outcomes.match_outcome_tie_sum"),
      losses: raw(values.losses, "charts_data.outcomes.match_outcome_defeat_sum"),
      goalsFor: raw(values.goalsFor, "charts_data.scores.score_for_sum"),
      goalsAgainst: raw(values.goalsAgainst, "charts_data.scores.score_against_sum"),
      goalDifference: derivedMetric(calculateGoalDifference(values.goalsFor, values.goalsAgainst), {
        formula: "goalsFor - goalsAgainst", dependencies: ["goalsFor", "goalsAgainst"],
      }),
      goalsForPerMatch: derivedMetric(
        values.goalsFor === null ? null : calculateGoalsPerMatch(values.goalsFor, values.matchesPlayed),
        { formula: "goalsFor / matchesPlayed", dependencies: ["goalsFor", "matchesPlayed"] },
      ),
      goalsAgainstPerMatch: derivedMetric(
        values.goalsAgainst === null ? null : calculateGoalsPerMatch(values.goalsAgainst, values.matchesPlayed),
        { formula: "goalsAgainst / matchesPlayed", dependencies: ["goalsAgainst", "matchesPlayed"] },
      ),
      winRate: derivedMetric(
        values.wins === null ? null : calculateWinRate(values.wins, values.matchesPlayed),
        { formula: "wins / matchesPlayed * 100", dependencies: ["wins", "matchesPlayed"] },
      ),
    },
    officialAggregate: true,
    completeEventCount: audit.completeEventCount,
    unavailableEventCount: audit.unavailableEventCount,
  };
}

function flattenEventPlayerStats(player, eventId) {
  if (!Array.isArray(player?.stats)) return new Map();
  const output = new Map();
  for (const group of player.stats) {
    if (!Array.isArray(group?.stats)) continue;
    for (const stat of group.stats) {
      const slug = String(stat?.slug_name ?? "");
      if (!slug) continue;
      if (output.has(slug)) {
        throw new StatisticsValidationError(`Le match ${eventId} contient deux fois ${slug}.`);
      }
      output.set(slug, stat?.value ?? null);
    }
  }
  return output;
}

function normalizeEvents(eventSources, teamId, knownPlayerIds) {
  const seen = new Set();
  const events = [];
  const orphanIds = new Set();
  for (const source of eventSources) {
    const eventId = id(source.eventId, "Identifiant de match");
    if (seen.has(eventId)) throw new StatisticsValidationError(`Le match ${eventId} est dupliqué.`);
    seen.add(eventId);
    const payload = source.payload;
    const opponents = [payload?.opponent_left, payload?.opponent_right];
    const teamIndex = opponents.findIndex(
      (opponent) => String(opponent?.id) === String(teamId) && opponent?.is_current_team === true,
    );
    const scoreGroup = payload?.opponents?.find((group) => group?.slug_name === "general");
    const scoreStat = scoreGroup?.stats?.find((stat) => stat?.slug_name === "score");
    const leftScore = integer(scoreStat?.value_left, `Score gauche du match ${eventId}`);
    const rightScore = integer(scoreStat?.value_right, `Score droit du match ${eventId}`);
    const isInternalUnscoredMatch =
      opponents.filter(Boolean).length > 0 &&
      opponents.filter(Boolean).every((opponent) => String(opponent.id) === String(teamId)) &&
      leftScore === null &&
      rightScore === null;
    if (
      teamIndex < 0 &&
      !isInternalUnscoredMatch &&
      (opponents.some(Boolean) || leftScore !== null || rightScore !== null)
    ) {
      throw new StatisticsValidationError(`Le club Lykos n'est pas identifiable dans le match ${eventId}.`);
    }
    const outcome = teamIndex < 0 ? null : opponents[teamIndex]?.match_outcome ?? null;
    if (outcome !== null && !OUTCOMES.has(outcome)) {
      throw new StatisticsValidationError(`Résultat inconnu dans le match ${eventId}.`);
    }
    const playerRows = [];
    for (const player of payload?.players ?? []) {
      const sporteasyId = id(player?.id, `Joueur du match ${eventId}`);
      if (!knownPlayerIds.has(sporteasyId)) orphanIds.add(sporteasyId);
      const stats = flattenEventPlayerStats(player, eventId);
      playerRows.push({
        sporteasyId,
        grade: stats.has("player_grade") ? decimal(stats.get("player_grade"), "Note joueur") : null,
      });
    }
    events.push({
      eventId,
      seasonId: id(source.seasonId, "Saison de match"),
      categoryId: source.categoryId ?? null,
      categoryType: source.categoryType,
      categorySlug: source.categorySlug ?? null,
      startAt: source.startAt ?? null,
      outcome,
      goalsFor: teamIndex < 0 ? null : teamIndex === 0 ? leftScore : rightScore,
      goalsAgainst: teamIndex < 0 ? null : teamIndex === 0 ? rightScore : leftScore,
      players: playerRows,
      endpoint: source.endpoint,
    });
  }
  if (orphanIds.size) {
    throw new StatisticsValidationError(
      `${orphanIds.size} statistique(s) joueur sont orphelines.`,
      { orphanPlayerIds: [...orphanIds].sort() },
    );
  }
  return events;
}

function aggregateTeam(events) {
  const unique = new Map(events.map((event) => [event.eventId, event]));
  const complete = [...unique.values()].filter(
    (event) => OUTCOMES.has(event.outcome) && event.goalsFor !== null && event.goalsAgainst !== null,
  );
  if (complete.length === 0) {
    const unavailable = (formula, dependencies = []) => derivedMetric(null, { formula, dependencies });
    return {
      metrics: {
        matchesPlayed: unavailable("count(unique completed eventId)"),
        wins: unavailable("count(outcome = victory)", ["matchesPlayed"]),
        draws: unavailable("count(outcome = tie)", ["matchesPlayed"]),
        losses: unavailable("count(outcome = defeat)", ["matchesPlayed"]),
        goalsFor: unavailable("sum(goalsFor)", ["matchesPlayed"]),
        goalsAgainst: unavailable("sum(goalsAgainst)", ["matchesPlayed"]),
        goalDifference: unavailable("goalsFor - goalsAgainst", ["goalsFor", "goalsAgainst"]),
        goalsForPerMatch: unavailable("goalsFor / matchesPlayed", ["goalsFor", "matchesPlayed"]),
        goalsAgainstPerMatch: unavailable("goalsAgainst / matchesPlayed", ["goalsAgainst", "matchesPlayed"]),
        winRate: unavailable("wins / matchesPlayed * 100", ["wins", "matchesPlayed"]),
      },
      completeEventCount: 0,
      unavailableEventCount: unique.size,
    };
  }
  const outcomes = complete.map((event) => event.outcome);
  const matchesPlayed = complete.length;
  const wins = outcomes.filter((outcome) => outcome === "victory").length;
  const draws = outcomes.filter((outcome) => outcome === "tie").length;
  const losses = outcomes.filter((outcome) => outcome === "defeat").length;
  const goalsFor = complete.reduce((sum, event) => sum + event.goalsFor, 0);
  const goalsAgainst = complete.reduce((sum, event) => sum + event.goalsAgainst, 0);
  if (matchesPlayed !== wins + draws + losses) {
    throw new StatisticsValidationError("Matchs != victoires + nuls + défaites.");
  }
  const derived = (value, formula, dependencies = []) => derivedMetric(value, { formula, dependencies });
  return {
    metrics: {
      matchesPlayed: derived(matchesPlayed, "count(unique completed eventId)"),
      wins: derived(wins, "count(outcome = victory)", ["matchesPlayed"]),
      draws: derived(draws, "count(outcome = tie)", ["matchesPlayed"]),
      losses: derived(losses, "count(outcome = defeat)", ["matchesPlayed"]),
      goalsFor: derived(goalsFor, "sum(goalsFor)", ["matchesPlayed"]),
      goalsAgainst: derived(goalsAgainst, "sum(goalsAgainst)", ["matchesPlayed"]),
      goalDifference: derived(calculateGoalDifference(goalsFor, goalsAgainst), "goalsFor - goalsAgainst", ["goalsFor", "goalsAgainst"]),
      goalsForPerMatch: derived(calculateGoalsPerMatch(goalsFor, matchesPlayed), "goalsFor / matchesPlayed", ["goalsFor", "matchesPlayed"]),
      goalsAgainstPerMatch: derived(calculateGoalsPerMatch(goalsAgainst, matchesPlayed), "goalsAgainst / matchesPlayed", ["goalsAgainst", "matchesPlayed"]),
      winRate: derived(calculateWinRate(wins, matchesPlayed), "wins / matchesPlayed * 100", ["wins", "matchesPlayed"]),
      longestWinningStreak: derived(calculateLongestStreak(outcomes, new Set(["victory"])), "longest consecutive victory outcomes", ["matchesPlayed"]),
      longestUnbeatenStreak: derived(calculateLongestStreak(outcomes, new Set(["victory", "tie"])), "longest consecutive victory or tie outcomes", ["matchesPlayed"]),
    },
    completeEventCount: complete.length,
    unavailableEventCount: unique.size - complete.length,
  };
}

function aggregateTeamCategories(rows, events) {
  if (rows.length === 0) return aggregateTeam([]);
  const keys = ["matchesPlayed", "wins", "draws", "losses", "goalsFor", "goalsAgainst"];
  const values = {};
  for (const key of keys) {
    values[key] = rows.some((row) => row.metrics.matchesPlayed > 0 && row.metrics[key] === null)
      ? null
      : rows.reduce((sum, row) => sum + (row.metrics[key] ?? 0), 0);
  }
  const endpoints = [...new Set(rows.map((row) => row.endpoint))];
  const sumMetric = (key) => derivedMetric(values[key], {
    formula: `sum(category.${key})`,
    dependencies: [`SportEasy category ${key}`],
  });
  const metrics = {
    matchesPlayed: sumMetric("matchesPlayed"),
    wins: sumMetric("wins"),
    draws: sumMetric("draws"),
    losses: sumMetric("losses"),
    goalsFor: sumMetric("goalsFor"),
    goalsAgainst: sumMetric("goalsAgainst"),
    goalDifference: derivedMetric(calculateGoalDifference(values.goalsFor, values.goalsAgainst), {
      formula: "goalsFor - goalsAgainst", dependencies: ["goalsFor", "goalsAgainst"],
    }),
    goalsForPerMatch: derivedMetric(
      values.goalsFor === null ? null : calculateGoalsPerMatch(values.goalsFor, values.matchesPlayed),
      { formula: "goalsFor / matchesPlayed", dependencies: ["goalsFor", "matchesPlayed"] },
    ),
    goalsAgainstPerMatch: derivedMetric(
      values.goalsAgainst === null ? null : calculateGoalsPerMatch(values.goalsAgainst, values.matchesPlayed),
      { formula: "goalsAgainst / matchesPlayed", dependencies: ["goalsAgainst", "matchesPlayed"] },
    ),
    winRate: derivedMetric(
      values.wins === null ? null : calculateWinRate(values.wins, values.matchesPlayed),
      { formula: "wins / matchesPlayed * 100", dependencies: ["wins", "matchesPlayed"] },
    ),
  };
  for (const metric of Object.values(metrics)) metric.endpoints = endpoints;
  const detailed = aggregateTeam(events);
  return {
    metrics,
    categoryCount: rows.length,
    completeEventCount: detailed.completeEventCount,
    unavailableEventCount: detailed.unavailableEventCount,
  };
}

function compareGlobalWithEvents(globalRows, events) {
  const warnings = [];
  for (const row of globalRows) {
    const exactEvents = events.filter(
      (event) =>
        event.seasonId === row.seasonId &&
        event.categoryType === row.categoryType &&
        event.categorySlug === row.categorySlug,
    );
    const detailed = aggregateTeam(exactEvents).metrics;
    const comparisons = Object.fromEntries(
      ["matchesPlayed", "wins", "draws", "losses", "goalsFor", "goalsAgainst"].map((key) => [
        key,
        detailed[key].value,
      ]),
    );
    const fields = Object.keys(comparisons).filter(
      (key) =>
        row.metrics[key] !== null &&
        comparisons[key] !== null &&
        row.metrics[key] !== comparisons[key],
    );
    if (fields.length) {
      warnings.push({
        code: "event-detail-vs-global-mismatch",
        seasonId: row.seasonId,
        categoryId: row.categoryId,
        fields,
      });
    }
  }
  return warnings;
}

function additiveValue(rows, key) {
  if (!rows.length || rows.some((row) => row.metrics[key] === null)) return null;
  return rows.reduce((sum, row) => sum + row.metrics[key], 0);
}

function aggregatePlayers(rows, events) {
  const rowsByPlayer = Map.groupBy(rows, (row) => row.sporteasyId);
  const gradesByPlayer = new Map();
  for (const event of events) {
    for (const player of event.players) {
      if (player.grade === null) continue;
      if (!gradesByPlayer.has(player.sporteasyId)) gradesByPlayer.set(player.sporteasyId, []);
      gradesByPlayer.get(player.sporteasyId).push(player.grade);
    }
  }
  const players = {};
  for (const [sporteasyId, playerRows] of rowsByPlayer) {
    const endpoints = [...new Set(playerRows.map((row) => row.endpoint))];
    const values = Object.fromEntries(
      Object.keys(PLAYER_ADDITIVE_METRICS).map((key) => [key, additiveValue(playerRows, key)]),
    );
    const matches = values.matchesPlayed;
    const grades = gradesByPlayer.get(sporteasyId) ?? [];
    const metric = (value, field) => rawMetric(value, { field, endpoints });
    players[sporteasyId] = {
      sporteasyId,
      metrics: {
        matchesPlayed: metric(matches, "has_attended_strict_sum"),
        wins: metric(values.wins, "player_match_outcome_victory_sum"),
        draws: metric(values.draws, "player_match_outcome_tie_sum"),
        losses: metric(values.losses, "player_match_outcome_defeat_sum"),
        goals: metric(values.goals, "player_goals_strict_sum"),
        assists: metric(values.assists, "player_assists_strict_sum"),
        manOfMatch: metric(values.manOfMatch, "man_of_event_strict_sum"),
        gradeAverage: derivedMetric(calculateAverage(grades, 2), {
          formula: "sum(event player_grade) / count(graded unique eventId)",
          dependencies: ["player_grade"],
        }),
        gradeMin: derivedMetric(grades.length ? Math.min(...grades) : null, {
          formula: "min(event player_grade)", dependencies: ["player_grade"],
        }),
        gradeMax: derivedMetric(grades.length ? Math.max(...grades) : null, {
          formula: "max(event player_grade)", dependencies: ["player_grade"],
        }),
        goalsPerMatch: derivedMetric(
          values.goals === null || matches === null ? null : calculateGoalsPerMatch(values.goals, matches),
          { formula: "goals / matchesPlayed", dependencies: ["goals", "matchesPlayed"] },
        ),
        assistsPerMatch: derivedMetric(
          values.assists === null || matches === null ? null : safeDivide(values.assists, matches, 2),
          { formula: "assists / matchesPlayed", dependencies: ["assists", "matchesPlayed"] },
        ),
        manOfMatchPerMatch: derivedMetric(
          values.manOfMatch === null || matches === null ? null : safeDivide(values.manOfMatch, matches, 2),
          { formula: "manOfMatch / matchesPlayed", dependencies: ["manOfMatch", "matchesPlayed"] },
        ),
      },
      customMetrics: playerRows.some((row) => row.metrics.challengePoints !== null)
        ? [{
            key: "player_challenge_points_sum",
            label: "Points de challenge",
            ...rawMetric(
              playerRows.reduce((sum, row) => sum + (row.metrics.challengePoints ?? 0), 0),
              { field: "player_challenge_points_sum", endpoints },
            ),
          }]
        : [],
    };
  }
  return players;
}

function normalizeRankings(captures, teamId, seasonsBySlug) {
  const rankings = [];
  for (const capture of captures) {
    const seasonSlug = capture.payload?.category_season?.season_slug_name;
    const seasonId = seasonsBySlug.get(seasonSlug);
    if (!seasonId) throw new StatisticsValidationError(`Classement rattaché à une saison inconnue : ${seasonSlug}.`);
    const row = capture.payload?.results?.find((entry) => String(entry?.team?.id) === String(teamId));
    if (!row) {
      throw new StatisticsValidationError(`Lykos est absent du classement ${capture.categoryId}.`);
    }
    const values = resultsMap(row.results, `Classement ${capture.categoryId}`);
    const get = (slug) => values.has(slug) ? integer(values.get(slug), slug) : null;
    const matches = get("match_outcome_reduce_len");
    const wins = get("match_outcome_victory_sum");
    const draws = get("match_outcome_tie_sum");
    const losses = get("match_outcome_defeat_sum");
    const goalsFor = get("score_for_sum");
    const goalsAgainst = get("score_against_sum");
    const goalDifference = get("score_diff_sum");
    if (matches !== null && [wins, draws, losses].every(Number.isInteger) && matches !== wins + draws + losses) {
      throw new StatisticsValidationError(`Le classement ${capture.categoryId} a un bilan incohérent.`);
    }
    if (goalDifference !== null && goalsFor !== null && goalsAgainst !== null && goalDifference !== goalsFor - goalsAgainst) {
      throw new StatisticsValidationError(`Le classement ${capture.categoryId} a une différence de buts incohérente.`);
    }
    rankings.push({
      seasonId,
      categoryId: String(capture.categoryId),
      categoryLabel: capture.categoryLabel,
      rank: integer(row.rank, "Rang", { nullable: false }),
      points: get("championship_points_sum"),
      matchesPlayed: matches,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference,
      pointsPerMatch: values.has("championship_points_reduce_avg")
        ? decimal(values.get("championship_points_reduce_avg"), "Points par match")
        : null,
      endpoint: capture.endpoint,
    });
  }
  return rankings;
}

function period({ key, label, seasonIds, officialPlayerCapture, officialGlobalCapture, events, rankings }) {
  const seasonSet = new Set(seasonIds);
  const selectedEvents = events.filter((event) => seasonSet.has(event.seasonId));
  return {
    key,
    label,
    seasonIds,
    team: normalizeOfficialTeam(officialGlobalCapture, selectedEvents),
    players: normalizeOfficialPlayers(officialPlayerCapture),
    rankings: key === "allTime" ? [] : rankings.filter((ranking) => seasonSet.has(ranking.seasonId)),
  };
}

export function buildStatisticsRepository({
  teamId,
  seasons,
  playerCaptures,
  globalCaptures,
  aggregatePlayerCaptures,
  aggregateGlobalCaptures,
  rankingCaptures,
  eventSources,
  playersRepository,
  syncedAt = new Date().toISOString(),
}) {
  if (!Array.isArray(seasons) || seasons.length === 0) {
    throw new StatisticsValidationError("Aucune saison statistique.");
  }
  const normalizedSeasons = seasons.map((season) => ({
    sporteasyId: id(season.sporteasyId ?? season.id, "Identifiant saison"),
    name: String(season.name ?? "").trim(),
    slugName: String(season.slugName ?? season.slug_name ?? "").trim(),
    isCurrent: season.isCurrent ?? season.current === true,
    startDate: season.startDate ?? season.start_date ?? null,
  })).sort((left, right) => String(left.startDate).localeCompare(String(right.startDate)));
  const currentIndex = normalizedSeasons.findIndex((season) => season.isCurrent);
  if (currentIndex < 0) throw new StatisticsValidationError("Saison actuelle introuvable.");
  const currentSeason = normalizedSeasons[currentIndex];
  const previousSeason = normalizedSeasons[currentIndex - 1] ?? null;
  const seasonsBySlug = new Map(normalizedSeasons.map((season) => [season.slugName, season.sporteasyId]));
  const { rows: playerRows, evidence } = normalizePlayerCategoryCaptures(playerCaptures, seasonsBySlug);
  const globalRows = normalizeGlobalCaptures(globalCaptures, seasonsBySlug);
  const enrichedPlayersRepository = enrichPlayersRepository(playersRepository, evidence);
  const knownPlayerIds = new Set(enrichedPlayersRepository.players.map((player) => String(player.sporteasyId)));
  const events = normalizeEvents(eventSources, teamId, knownPlayerIds);
  const comparisonWarnings = compareGlobalWithEvents(globalRows, events);
  const rankings = normalizeRankings(rankingCaptures, teamId, seasonsBySlug);
  const allSeasonIds = normalizedSeasons.map((season) => season.sporteasyId);
  const currentOfficialPlayers = officialCapture(aggregatePlayerCaptures, {
    scope: "season", seasonId: currentSeason.sporteasyId, kind: "players",
  });
  const currentOfficialGlobal = officialCapture(aggregateGlobalCaptures, {
    scope: "season", seasonId: currentSeason.sporteasyId, kind: "global",
  });
  const previousOfficialPlayers = previousSeason
    ? officialCapture(aggregatePlayerCaptures, {
        scope: "season", seasonId: previousSeason.sporteasyId, kind: "players",
      })
    : null;
  const previousOfficialGlobal = previousSeason
    ? officialCapture(aggregateGlobalCaptures, {
        scope: "season", seasonId: previousSeason.sporteasyId, kind: "global",
      })
    : null;
  const allTimeOfficialPlayers = officialCapture(aggregatePlayerCaptures, {
    scope: "allTime", kind: "players",
  });
  const allTimeOfficialGlobal = officialCapture(aggregateGlobalCaptures, {
    scope: "allTime", kind: "global",
  });
  const periods = {
    current: period({
      key: "current",
      label: "Saison actuelle",
      seasonIds: [currentSeason.sporteasyId],
      officialPlayerCapture: currentOfficialPlayers,
      officialGlobalCapture: currentOfficialGlobal,
      events,
      rankings,
    }),
    previous: period({
      key: "previous",
      label: "Saison dernière",
      seasonIds: previousSeason ? [previousSeason.sporteasyId] : [],
      officialPlayerCapture: previousOfficialPlayers,
      officialGlobalCapture: previousOfficialGlobal,
      events,
      rankings,
    }),
    allTime: period({
      key: "allTime",
      label: "All-time",
      seasonIds: allSeasonIds,
      officialPlayerCapture: allTimeOfficialPlayers,
      officialGlobalCapture: allTimeOfficialGlobal,
      events,
      rankings,
    }),
  };

  return {
    repository: {
      metadata: {
        source: "SportEasy",
        syncedAt,
        validationStatus: "valid",
        seasonsAnalyzed: allSeasonIds,
        currentSeasonId: currentSeason.sporteasyId,
        previousSeasonId: previousSeason?.sporteasyId ?? null,
        uniqueEventCount: events.length,
        completedEventCount: aggregateTeam(events).completeEventCount,
        unavailableEventCount: aggregateTeam(events).unavailableEventCount,
        playerPeriodSource: "SportEasy stats/all/players",
        teamPeriodSource: "SportEasy stats/all/global",
        playerCategoryRecordCount: playerRows.length,
        customStatisticsFound: ["player_challenge_points_sum"].filter((slug) =>
          playerRows.some((row) => row.metrics.challengePoints !== null),
        ),
        excludedStatistics: [...EXCLUDED_SLUGS].sort(),
        errors: [],
        warnings: [
          ...(periods.allTime.team.unavailableEventCount
            ? [`${periods.allTime.team.unavailableEventCount} match(s) sans score ou résultat complet.`]
            : []),
          ...comparisonWarnings,
        ],
      },
      periods,
    },
    enrichedPlayersRepository,
  };
}
