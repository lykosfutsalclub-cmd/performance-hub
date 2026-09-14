import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlayerSecondaryRepository,
  calculateAverageMatchesTogether,
  calculateFavoriteLineup,
  calculatePlayerPartnerships,
  safeDivide,
} from "../src/statistics/player-secondary-analytics.mjs";

const PLAYER_ID = "1";

function officialMetric(value) {
  return { value, status: "available" };
}

function playerMetrics({ matches, goals, assists, manOfMatch = 0, averageRating = null }) {
  return {
    matchesPlayed: officialMetric(matches),
    goals: officialMetric(goals),
    assists: officialMetric(assists),
    manOfMatch: officialMetric(manOfMatch),
    gradeAverage: averageRating === null ? { value: null, status: "unavailable" } : officialMetric(averageRating),
  };
}

function match({ id, year = 2026, participants = [PLAYER_ID], goals = {}, assists = {}, grades = {}, manOfMatch = {}, outcome = "victory", team = 5, opponent = 2, eventRating = null }) {
  return {
    eventId: String(id),
    seasonId: "season-1",
    startAt: `${year}-01-${String(id).padStart(2, "0")}T20:00:00+01:00`,
    outcome,
    score: { team, opponent },
    status: { isPast: true, isCancelled: false },
    category: { type: "friendly_match", name: "Test-Match" },
    opponent: { id: `opponent-${id}`, name: `Adversaire ${id}` },
    eventRating: eventRating === null ? null : { average: eventRating, voteCount: 1, scaleMax: 6 },
    attendance: {
      entries: participants.map((profileId) => ({ profileId: String(profileId), status: "on_time" })),
    },
    playerStatistics: participants.map((profileId) => ({
      profileId: String(profileId),
      metrics: {
        presence: "on_time",
        player_goals: goals[profileId] ?? 0,
        player_assists: assists[profileId] ?? 0,
        player_grade: grades[profileId] ?? null,
        man_of_event: manOfMatch[profileId] ?? false,
        player_match_outcome: outcome,
      },
    })),
  };
}

test("le palmarès reprend uniquement les récompenses officielles communiquées", () => {
  const players = [
    { sporteasyId: "1", displayName: "Premier", isCurrent: true },
    { sporteasyId: "2", displayName: "Deuxième", isCurrent: true },
    { sporteasyId: "3", displayName: "Troisième", isCurrent: true },
  ];
  const matches = [
    match({ id: 1, year: 2024, participants: ["1", "2", "3"], goals: { 1: 2, 2: 2 }, assists: { 3: 3 }, manOfMatch: { 3: true } }),
    match({ id: 2, year: 2025, participants: ["1", "2", "3"], goals: { 2: 4 }, assists: { 1: 2 } }),
    match({ id: 3, year: 2026, participants: ["1", "2", "3"], goals: { 3: 9 }, assists: { 3: 9 } }),
  ];
  const built = repository({ matches, players, officialPlayerAwards: { throughYear: 2025, awards: [
    { year: 2025, type: "top_scorer", playerId: "2" },
    { year: 2024, type: "player_of_year", playerId: "3" },
  ] } });

  assert.equal(built.calendarYearAwards.throughYear, 2025);
  assert.equal(built.calendarYearAwards.byPlayer["1"], undefined);
  assert.deepEqual(built.calendarYearAwards.byPlayer["2"], [
    { type: "top_scorer", year: 2025 },
  ]);
  assert.deepEqual(built.calendarYearAwards.byPlayer["3"], [
    { type: "player_of_year", year: 2024 },
  ]);
  assert.equal(built.calendarYearAwards.years.some(({ year }) => year === 2026), false);
});

function repository({ matches = [], primary = playerMetrics({ matches: 0, goals: 0, assists: 0 }), players, officialPlayerAwards = { awards: [] } } = {}) {
  const roster = players ?? [{ sporteasyId: PLAYER_ID, displayName: "Joueur Test", isCurrent: true }];
  const period = {
    seasonIds: ["season-1"],
    players: { [PLAYER_ID]: { metrics: primary } },
  };
  return buildPlayerSecondaryRepository({
    matchRepository: { matches },
    statisticsRepository: { periods: { current: period, previous: period, allTime: period } },
    playersRepository: { players: roster },
    officialPlayerAwards,
    generatedAt: "2026-08-27T00:00:00.000Z",
  });
}

test("les matchs renseignés puis marqués annulés sont réintégrés après vérification", () => {
  const corrected = match({ id: 6, year: 2022, participants: ["1", "2"], goals: { 1: 2, 2: 6 }, assists: { 1: 4, 2: 3 }, manOfMatch: { 2: true } });
  corrected.status.isCancelled = true;
  const players = [
    { sporteasyId: "1", displayName: "Premier", isCurrent: true },
    { sporteasyId: "2", displayName: "Deuxième", isCurrent: true },
  ];
  const period = { seasonIds: ["season-1"], players: { "1": { metrics: playerMetrics({ matches: 0, goals: 0, assists: 0 }) } } };
  const built = buildPlayerSecondaryRepository({
    matchRepository: { matches: [corrected] },
    statisticsRepository: { periods: { current: period, previous: period, allTime: period } },
    playersRepository: { players },
    verifiedPlayedCancelledMatches: {
      matches: [{ eventId: "6", playerStatistics: corrected.playerStatistics }],
    },
    generatedAt: "2026-08-27T00:00:00.000Z",
  });

  assert.equal(built.calendarYearAwards.byPlayer["2"], undefined);
  assert.equal(built.calendarYearAwards.recoveredCancelledMatchCount, 1);
  assert.equal(built.periods.allTime.matchCount, 1);
});

test("une année déclarée caduque ne produit aucune récompense", () => {
  const played = match({ id: 6, year: 2022, participants: ["1"], goals: { 1: 8 }, assists: { 1: 6 }, manOfMatch: { 1: true } });
  const period = { seasonIds: ["season-1"], players: { "1": { metrics: playerMetrics({ matches: 1, goals: 8, assists: 6 }) } } };
  const built = buildPlayerSecondaryRepository({
    matchRepository: { matches: [played] },
    statisticsRepository: { periods: { current: period, previous: period, allTime: period } },
    playersRepository: { players: [{ sporteasyId: "1", displayName: "Joueur", isCurrent: true }] },
    verifiedPlayedCancelledMatches: { excludedCalendarAwardYears: [2022], matches: [] },
    generatedAt: "2026-08-27T00:00:00.000Z",
  });

  assert.deepEqual(built.calendarYearAwards.excludedYears, [2022]);
  assert.equal(built.calendarYearAwards.years.some(({ year }) => year === 2022), false);
  assert.equal(built.calendarYearAwards.byPlayer["1"], undefined);
});

test("cas normal : 30 matchs, 15 buts et 10 passes", () => {
  const matches = Array.from({ length: 30 }, (_, index) => match({
    id: index + 1,
    goals: { [PLAYER_ID]: index < 15 ? 1 : 0 },
    assists: { [PLAYER_ID]: index < 10 ? 1 : 0 },
  }));
  const analytics = repository({
    matches,
    primary: playerMetrics({ matches: 30, goals: 15, assists: 10, averageRating: 7.2 }),
  }).periods.current.players[PLAYER_ID];

  assert.equal(analytics.finishing.goalsPerGame, 0.5);
  assert.equal(analytics.creation.assistsPerGame, 10 / 30);
  assert.equal(analytics.offensive.contributions, 25);
  assert.equal(analytics.offensive.contributionsPerGame, 25 / 30);
  assert.equal(analytics.offensive.offensiveContributionIndex, (25 / 150) * 100);
  assert.equal(analytics.finishing.scoringGameRate, 50);
  assert.ok(Math.abs(analytics.creation.assistGameRate - 100 / 3) < 1e-12);
  assert.equal(analytics.primary.detailedResults.wins, 30);
});

test("aucun match : les divisions restent nulles, jamais NaN, Infinity ou faux zéro", () => {
  const analytics = repository().periods.current.players[PLAYER_ID];
  assert.equal(safeDivide(4, 0), null);
  assert.equal(analytics.finishing.goalsPerGame, null);
  assert.equal(analytics.creation.assistsPerGame, null);
  assert.equal(analytics.offensive.contributionsPerGame, null);
  assert.equal(analytics.finishing.scoringGameRate, null);
});

test("aucun but sur 20 matchs reste un vrai zéro avec un ratio calculable", () => {
  const matches = Array.from({ length: 20 }, (_, index) => match({ id: index + 1 }));
  const analytics = repository({
    matches,
    primary: playerMetrics({ matches: 20, goals: 0, assists: 4 }),
  }).periods.current.players[PLAYER_ID];
  assert.equal(analytics.finishing.goals, 0);
  assert.equal(analytics.finishing.goalsPerGame, 0);
  assert.equal(analytics.finishing.scoringGameRate, 0);
  assert.equal(analytics.finishing.maxGoalsInGame, 0);
});

test("un joueur avec un seul match produit des valeurs vérifiables", () => {
  const analytics = repository({
    matches: [match({ id: 1, goals: { [PLAYER_ID]: 2 }, assists: { [PLAYER_ID]: 1 }, opponent: 0 })],
    primary: playerMetrics({ matches: 1, goals: 2, assists: 1 }),
  }).periods.current.players[PLAYER_ID];
  assert.equal(analytics.finishing.maxGoalsInGame, 2);
  assert.equal(analytics.offensive.maxContributionsInGame, 3);
  assert.equal(analytics.offensive.decisiveStreak, 1);
  assert.equal(analytics.defensive.bestDefensiveGame, 0);
});

test("les années civiles sont reconstruites match par match et Metron exige exactement 9 matchs", () => {
  const eightMatches = Array.from({ length: 8 }, (_, index) => match({
    id: index + 1,
    year: 2025,
    goals: { [PLAYER_ID]: 1 },
    grades: { [PLAYER_ID]: 7 },
  }));
  const ninthMatch = match({ id: 9, year: 2026, goals: { [PLAYER_ID]: 2 }, grades: { [PLAYER_ID]: 8 } });
  const built = repository({
    matches: [...eightMatches, ninthMatch],
    primary: playerMetrics({ matches: 9, goals: 10, assists: 0, averageRating: 7.1 }),
  });
  assert.equal(built.calendarYears["2025"].players[PLAYER_ID].primary.matches, 8);
  assert.equal(built.calendarYears["2025"].players[PLAYER_ID].performance.overall, null);
  assert.equal(built.calendarYears["2025"].players[PLAYER_ID].rankings.goals, null);
  assert.equal(built.calendarYears["2026"].players[PLAYER_ID].primary.matches, 1);
  assert.equal(built.calendarYears["2026"].players[PLAYER_ID].performance.overall, null);

  const nineInOneYear = repository({
    matches: [...eightMatches, match({ id: 9, year: 2025, goals: { [PLAYER_ID]: 2 }, grades: { [PLAYER_ID]: 8 } })],
    primary: playerMetrics({ matches: 9, goals: 10, assists: 0, averageRating: 7.1 }),
  });
  assert.equal(nineInOneYear.calendarYears["2025"].minimumMatches, 9);
  assert.ok(Number.isFinite(nineInOneYear.calendarYears["2025"].players[PLAYER_ID].performance.overall));
});

test("une année civile traite à égalité joueurs actuels et anciens dès 9 apparitions", () => {
  const matches = Array.from({ length: 9 }, (_, index) => match({
    id: index + 1,
    year: 2025,
    participants: ["1", "2"],
    goals: { 1: index % 2, 2: index % 2 },
    assists: { 1: index % 3 === 0 ? 1 : 0, 2: index % 3 === 0 ? 1 : 0 },
    grades: { 1: 7, 2: 7 },
  }));
  const built = repository({
    matches,
    players: [
      { sporteasyId: "1", displayName: "Actuel", isCurrent: true },
      { sporteasyId: "2", displayName: "Ancien", isCurrent: false },
    ],
  });
  const annual = built.calendarYears["2025"];
  assert.equal(annual.minimumMatches, 9);
  assert.equal(annual.eligiblePlayerCount, 2);
  assert.deepEqual(annual.players["1"].performance, annual.players["2"].performance);
  assert.equal(annual.players["1"].performance.confidence, 9 / 15);
  assert.equal(annual.reconciliation.status, "verified");
});

test("la réconciliation annuelle refuse doublons, entraînements et double rattachement d'un tournoi", () => {
  const first = match({ id: 1, year: 2025 });
  first.tournamentContainerId = "tournoi-1";
  const duplicate = match({ id: 1, year: 2025 });
  const secondSummary = match({ id: 2, year: 2025 });
  secondSummary.tournamentContainerId = "tournoi-1";
  const training = match({ id: 3, year: 2025 });
  training.name = "Match entre nous";
  const built = repository({ matches: [first, duplicate, secondSummary, training] });
  const annual = built.calendarYears["2025"];
  assert.equal(annual.matchCount, 2);
  assert.equal(annual.reconciliation.tournamentSummaryCount, 2);
  assert.equal(annual.reconciliation.excludedInternalTrainingCount, 1);
  assert.equal(annual.validation.status, "invalid");
  assert.ok(annual.validation.issues.some((issue) => issue.code === "duplicate-match-event-id"));
  assert.ok(annual.validation.issues.some((issue) => issue.code === "internal-training-in-statistical-repository"));
  assert.ok(annual.validation.issues.some((issue) => issue.code === "tournament-container-linked-to-multiple-matches"));
});

test("le contexte équipe compare les vraies notes coach et Metron avec et sans le joueur", () => {
  const matches = [
    match({ id: 1, participants: ["1", "2"], grades: { 1: 8, 2: 7 }, eventRating: 5, team: 6, opponent: 2 }),
    match({ id: 2, participants: ["2"], grades: { 2: 5 }, eventRating: 3, team: 2, opponent: 5, outcome: "defeat" }),
  ];
  const built = repository({
    matches,
    primary: playerMetrics({ matches: 1, goals: 0, assists: 0, averageRating: 8 }),
    players: [
      { sporteasyId: "1", displayName: "Un", isCurrent: true },
      { sporteasyId: "2", displayName: "Deux", isCurrent: true },
    ],
  });
  const context = built.periods.current.players["1"].teamContext;
  assert.equal(context.coachRatingWithPlayer, 5);
  assert.equal(context.coachRatingWithoutPlayer, 3);
  assert.equal(context.coachRatedMatchesWithPlayer, 1);
  assert.equal(context.coachRatedMatchesWithoutPlayer, 1);
  assert.ok(Number.isInteger(context.teamMetronWithPlayer));
  assert.ok(Number.isInteger(context.teamMetronWithoutPlayer));
  assert.ok(context.teamMetronWithPlayer > context.teamMetronWithoutPlayer);
});

test("la part des buts utilise les matchs au score connu sans être annulée par un score manquant", () => {
  const matches = [
    match({ id: 1, goals: { [PLAYER_ID]: 2 }, team: 5 }),
    match({ id: 2, goals: { [PLAYER_ID]: 1 }, team: null }),
  ];
  const analytics = repository({
    matches,
    primary: playerMetrics({ matches: 2, goals: 3, assists: 0 }),
  }).periods.current.players[PLAYER_ID];
  assert.equal(analytics.finishing.teamGoalShare, 40);
  assert.deepEqual(analytics.trace.teamGoalShareCoverage, {
    appearances: 2,
    appearancesWithTeamTotal: 1,
    status: "partial",
  });
});

test("les cinq derniers matchs sont les cinq dernières apparitions du joueur", () => {
  const participationIds = new Set([2, 4, 6, 8, 9, 11]);
  const matches = Array.from({ length: 11 }, (_, index) => {
    const id = index + 1;
    return match({
      id,
      participants: participationIds.has(id) ? [PLAYER_ID] : ["2"],
      goals: { [PLAYER_ID]: id },
      assists: { [PLAYER_ID]: 1 },
    });
  });
  const analytics = repository({
    matches,
    primary: playerMetrics({ matches: 6, goals: 40, assists: 6 }),
    players: [
      { sporteasyId: PLAYER_ID, displayName: "Joueur Test", isCurrent: true },
      { sporteasyId: "2", displayName: "Absent Test", isCurrent: true },
    ],
  }).periods.current.players[PLAYER_ID];
  assert.deepEqual(analytics.trace.appearanceEventIds, ["2", "4", "6", "8", "9", "11"]);
  assert.equal(analytics.finishing.last5Goals, 4 + 6 + 8 + 9 + 11);
  assert.equal(analytics.creation.last5Assists, 5);
});

test("la composition favorite utilise la moyenne X", () => {
  const periodMatches = [{
    participants: new Set(["1", "2"]),
    outcome: "victory",
    playerDetails: { "1": { goals: 1, assists: 0 } },
  }];
  const partnerships = calculatePlayerPartnerships({
    selectedPlayerId: "1",
    periodMatches,
    playersById: new Map([["2", { displayName: "Partenaire" }]]),
  });
  assert.equal(partnerships[0].qualifies, false);
  assert.equal(calculateAverageMatchesTogether(partnerships), 1);
  assert.equal(calculateFavoriteLineup(partnerships)[0].playerId, "2");
});

test("un résultat manquant conserve le match ensemble mais rend le taux indisponible", () => {
  const periodMatches = [{
    participants: new Set(["1", "2"]),
    outcome: null,
    playerDetails: { "1": { goals: 0, assists: 0 } },
  }];
  const [partnership] = calculatePlayerPartnerships({
    selectedPlayerId: "1",
    periodMatches,
    playersById: new Map([["2", { displayName: "Partenaire" }]]),
    minMatchesTogether: 1,
  });
  assert.equal(partnership.matchesTogether, 1);
  assert.equal(partnership.matchesWithKnownOutcome, 0);
  assert.equal(partnership.winRate, null);
  assert.equal(partnership.outcomeCoverage, "partial");
});

test("la composition favorite complète les places manquantes sous X", () => {
  const periodMatches = Array.from({ length: 10 }, (_, index) => {
    const outcome = index < 3 || (index >= 5 && index < 8) ? "victory" : "defeat";
    return {
      participants: new Set(index < 5 ? ["1", "2", "3"] : ["1", "3"]),
      outcome,
      playerDetails: { "1": { goals: 1, assists: 0 } },
    };
  });
  const partnerships = calculatePlayerPartnerships({
    selectedPlayerId: "1",
    periodMatches,
    playersById: new Map([
      ["2", { displayName: "Cinq matchs" }],
      ["3", { displayName: "Dix matchs" }],
    ]),
  });
  assert.equal(calculateAverageMatchesTogether(partnerships), 7.5);
  const lineup = calculateFavoriteLineup(partnerships);
  assert.equal(lineup[0].playerId, "3");
  assert.equal(lineup[0].matchesTogether, 10);
  assert.equal(lineup[0].belowAverageFallback, false);
  assert.equal(lineup[1].playerId, "2");
  assert.equal(lineup[1].belowAverageFallback, true);
  assert.equal(lineup.length, 2);
});

test("la composition favorite contient toujours quatre joueurs lorsque quatre partenaires sont recensés", () => {
  const partnerships = [
    { playerId: "2", playerName: "A", matchesTogether: 10, winsTogether: 6, winRate: 60 },
    { playerId: "3", playerName: "B", matchesTogether: 8, winsTogether: 4, winRate: 50 },
    { playerId: "4", playerName: "C", matchesTogether: 4, winsTogether: 4, winRate: 100 },
    { playerId: "5", playerName: "D", matchesTogether: 3, winsTogether: 2, winRate: 66.7 },
    { playerId: "6", playerName: "E", matchesTogether: 2, winsTogether: 2, winRate: 100 },
  ];
  const lineup = calculateFavoriteLineup(partnerships, 4, 7);
  assert.deepEqual(lineup.map((partner) => partner.playerId), ["2", "3", "4", "6"]);
  assert.equal(lineup.length, 4);
  assert.equal(lineup.filter((partner) => partner.belowAverageFallback).length, 2);
});

test("une composition à quatre utilise les partenaires recensés même si certains résultats manquent", () => {
  const partnerships = [
    { playerId: "2", playerName: "A", matchesTogether: 5, winsTogether: 3, winRate: 60 },
    { playerId: "3", playerName: "B", matchesTogether: 5, winsTogether: 0, winRate: null },
    { playerId: "4", playerName: "C", matchesTogether: 4, winsTogether: 0, winRate: null },
    { playerId: "5", playerName: "D", matchesTogether: 3, winsTogether: 2, winRate: 66.7 },
  ];
  const lineup = calculateFavoriteLineup(partnerships, 4, 4.25);
  assert.equal(lineup.length, 4);
  assert.equal(lineup.filter((partner) => partner.missingResultFallback).length, 2);
});

test("toutes les relations du bloc collectif excluent les partenaires sous la moyenne X", () => {
  const players = [
    { sporteasyId: "1", displayName: "Joueur Test", isCurrent: true },
    { sporteasyId: "2", displayName: "Cinq matchs", isCurrent: true },
    { sporteasyId: "3", displayName: "Dix matchs", isCurrent: true },
  ];
  const matches = Array.from({ length: 10 }, (_, index) => match({
    id: index + 1,
    participants: index < 5 ? ["1", "2", "3"] : ["1", "3"],
    goals: { 1: 1 },
    outcome: index < 3 || (index >= 5 && index < 8) ? "victory" : "defeat",
  }));
  const collective = repository({
    matches,
    players,
    primary: playerMetrics({ matches: 10, goals: 10, assists: 0 }),
  }).periods.current.players[PLAYER_ID].collective;

  assert.equal(collective.averageMatchesTogether, 7.5);
  assert.equal(collective.minimumMatchesTogether, 8);
  assert.equal(collective.sampleRule, "average-matches-together");
  for (const relation of [
    collective.bestWinningPartner,
    collective.worstLosingPartner,
    collective.bestOffensivePartner,
    collective.worstOffensivePartner,
  ]) assert.equal(relation.playerId, "3");
});

test("une présence blessée dans les statistiques ne compte pas comme participation", () => {
  const injuredMatch = match({ id: 1 });
  injuredMatch.attendance.entries[0].status = "injured";
  injuredMatch.playerStatistics[0].metrics.presence = "injured";
  const analytics = repository({
    matches: [injuredMatch],
    primary: playerMetrics({ matches: 0, goals: 0, assists: 0 }),
  }).periods.current.players[PLAYER_ID];
  assert.equal(analytics.primary.detailedAppearanceCount, 0);
  assert.deepEqual(analytics.trace.appearanceEventIds, []);
});

test("un champ but ou passe omis par SportEasy devient zéro et reste traçable", () => {
  const sparseMatch = match({ id: 1 });
  delete sparseMatch.playerStatistics[0].metrics.player_goals;
  delete sparseMatch.playerStatistics[0].metrics.player_assists;
  const analytics = repository({
    matches: [sparseMatch],
    primary: playerMetrics({ matches: 1, goals: 0, assists: 0 }),
  }).periods.current.players[PLAYER_ID];
  assert.equal(analytics.finishing.last5Goals, 0);
  assert.equal(analytics.creation.last5Assists, 0);
  assert.deepEqual(analytics.trace.normalizedOmittedZeros, { goals: 1, assists: 1 });
  assert.equal(analytics.trace.issues.length, 0);
});

test("une normalisation à zéro qui contredit le total officiel bloque la publication", () => {
  const sparseMatch = match({ id: 1 });
  delete sparseMatch.playerStatistics[0].metrics.player_goals;
  const built = repository({
    matches: [sparseMatch],
    primary: playerMetrics({ matches: 1, goals: 1, assists: 0 }),
  });
  assert.equal(built.metadata.validationStatus, "invalid");
  assert.equal(built.periods.current.validation.issues[0].code, "official-vs-detailed-goals");
});

test("la moyenne X reste applicable à un joueur de moins de cinq matchs", () => {
  const players = [
    { sporteasyId: "1", displayName: "Trois matchs", isCurrent: true },
    { sporteasyId: "2", displayName: "Partenaire régulier", isCurrent: true },
  ];
  const matches = [1, 2, 3].map((id) => match({ id, participants: ["1", "2"] }));
  const analytics = repository({
    matches,
    players,
    primary: playerMetrics({ matches: 3, goals: 0, assists: 0 }),
  }).periods.current.players[PLAYER_ID];
  assert.equal(analytics.collective.minimumMatchesTogether, 3);
  assert.equal(analytics.collective.sampleRule, "average-matches-together");
  assert.equal(analytics.collective.bestWinningPartner.playerId, "2");
  assert.equal(analytics.collective.favoriteLineup.length, 1);
  assert.equal(analytics.collective.favoriteLineupComplete, false);
  assert.equal(analytics.collective.favoriteLineupCandidateCount, 1);
  assert.equal(analytics.collective.favoriteLineupAverageMatches, 3);
  assert.equal(analytics.collective.favoriteLineupMinimumMatches, 3);
});
