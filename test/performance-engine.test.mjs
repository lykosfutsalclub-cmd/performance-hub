import assert from "node:assert/strict";
import test from "node:test";
import { SCORING_CONFIG } from "../src/performance/scoring-config.mjs";
import { classifyScoringMatch, scoringMatchAudit, scoringMatchWeight } from "../src/performance/match-weights.mjs";
import { percentile } from "../src/performance/percentile-engine.mjs";
import {
  buildPerformanceMetrics,
  calculateAwardBonus,
  calculateManOfTheMatchBonus,
  calculateManOfTheMatchRating,
  calculateOverallRating,
  calculatePeriodPerformanceRatings,
  calculateTenureBonus,
} from "../src/performance/performance-engine.mjs";
import {
  adjustRatingForSample,
  clampRating,
  ratingFromPercentile,
  sampleConfidence,
  normalizePosition,
} from "../src/performance/performance-utils.mjs";

function scoringMatch({
  id = "1",
  name = "Test-Match",
  category = { type: "friendly_match", slug: "friendly", name: "Test-Match" },
  tournamentContainerId = null,
  participants = ["1"],
  goals = {},
  assists = {},
  goalsFor = 8,
  goalsAgainst = 5,
}) {
  return {
    eventId: String(id),
    date: `2026-01-${String(id).padStart(2, "0")}T20:00:00+01:00`,
    name,
    category,
    tournamentContainerId,
    participants: new Set(participants),
    playerDetails: Object.fromEntries(participants.map((playerId) => [playerId, {
      goals: goals[playerId] ?? 0,
      assists: assists[playerId] ?? 0,
    }])),
    goalsFor,
    goalsAgainst,
    teamAssists: participants.reduce((total, playerId) => total + (assists[playerId] ?? 0), 0),
  };
}

function players(current = true) {
  return [
    { sporteasyId: "1", displayName: "Alpha", isCurrent: current },
    { sporteasyId: "2", displayName: "Bravo", isCurrent: true },
  ];
}

test("l'échelle de notation est strictement limitée à 1–99", () => {
  assert.equal(SCORING_CONFIG.VERSION, "METRON 1.0.1");
  assert.equal(SCORING_CONFIG.EFFECTIVE_DATE, "2026-09-08");
  assert.equal(clampRating(-200), 1);
  assert.equal(clampRating(0), 1);
  assert.equal(clampRating(100), 99);
  assert.equal(clampRating(500), 99);
  assert.equal(ratingFromPercentile(0), 1);
  assert.equal(ratingFromPercentile(1), 99);
  assert.equal(ratingFromPercentile(0.5), 50);
});

test("le meilleur percentile atteint 99, le plus faible 1 et la médiane 50", () => {
  const population = [10, 20, 30];
  assert.equal(ratingFromPercentile(percentile(10, population)), 1);
  assert.equal(ratingFromPercentile(percentile(20, population)), 50);
  assert.equal(ratingFromPercentile(percentile(30, population)), 99);
});

test("une métrique où moins est mieux inverse correctement la distribution", () => {
  const population = [2, 5, 9];
  assert.equal(ratingFromPercentile(percentile(2, population, "lower")), 99);
  assert.equal(ratingFromPercentile(percentile(9, population, "lower")), 1);
});

test("la pondération reste douce tout en respectant la hiérarchie sportive", () => {
  const testMatch = scoringMatch({});
  const tournament = scoringMatch({
    name: "Tournoi du Lykos",
    category: { type: "cup_match", slug: "tournoi", name: "Tournoi" },
  });
  const proTour = scoringMatch({ name: "Pro Tour — journée 1" });
  assert.equal(classifyScoringMatch(testMatch), "TEST_MATCH");
  assert.equal(classifyScoringMatch(tournament), "COMPETITION");
  assert.equal(classifyScoringMatch(proTour), "PROTOUR");
  assert.equal(scoringMatchWeight(testMatch), 1);
  assert.equal(scoringMatchWeight(tournament), 1.25);
  assert.equal(scoringMatchWeight(proTour), 1.5);
  assert.ok(scoringMatchWeight(proTour) > scoringMatchWeight(tournament));
  assert.ok(scoringMatchWeight(tournament) > scoringMatchWeight(testMatch));
});

test("un but ProTour est bonifié seulement dans la donnée interne de notation", () => {
  const match = scoringMatch({ name: "Championnat de France", goals: { "1": 1 } });
  const metrics = buildPerformanceMetrics({ playerId: "1", periodMatches: [match] });
  assert.equal(metrics.metrics.goals, 1.5);
  assert.equal(match.playerDetails["1"].goals, 1);
});

test("une catégorie inconnue est exclue du scoring et signalée", () => {
  const unknown = scoringMatch({ category: { type: "league", slug: "mystere", name: "Ligue mystère" } });
  const metrics = buildPerformanceMetrics({ playerId: "1", periodMatches: [unknown] });
  assert.equal(metrics.matchCount, 0);
  assert.equal(scoringMatchAudit([unknown]).length, 1);
  assert.equal(scoringMatchAudit([unknown])[0].code, "invalid-scoring-match");
});

test("une performance identique pèse davantage en compétition puis en ProTour", () => {
  const base = scoringMatch({ goals: { "1": 2 }, assists: { "1": 1 } });
  const variants = [
    base,
    { ...base, tournamentContainerId: "tournoi-1", category: { type: "tournament", name: "Tournoi" } },
    { ...base, name: "Pro Tour", category: { type: "championship_match", name: "Championnat de France" } },
  ];
  const values = variants.map((match) => buildPerformanceMetrics({ playerId: "1", periodMatches: [match] }).metrics);
  assert.deepEqual(values.map((metrics) => metrics.goals), [2, 2.5, 3]);
  assert.deepEqual(values.map((metrics) => metrics.contributions), [3, 3.75, 4.5]);
  assert.deepEqual(values.map((metrics) => metrics.goalsPerMatch), [2, 2, 2]);
});

test("NULL reste indisponible et n'est jamais converti en zéro", () => {
  assert.equal(clampRating(null), null);
  assert.equal(ratingFromPercentile(null), null);
  assert.equal(adjustRatingForSample(null, 1), null);
});

test("les petits échantillons sont ramenés vers 50 et la correction disparaît à 15 matchs", () => {
  assert.equal(sampleConfidence(1), 1 / 15);
  assert.ok(adjustRatingForSample(99, sampleConfidence(1)) < 60);
  assert.equal(sampleConfidence(15), 1);
  assert.equal(adjustRatingForSample(88, sampleConfidence(15)), 88);
});

test("OFFENSIF n'est pas recompté dans l'indice global", () => {
  const base = calculateOverallRating({ position: "A", blocks: { creation: 70, finishing: 80, defensive: 40, offensive: 1 } });
  const changed = calculateOverallRating({ position: "A", blocks: { creation: 70, finishing: 80, defensive: 40, offensive: 99 } });
  assert.equal(base.rating, changed.rating);
});

test("l'indice global reste compris entre les blocs qui le composent", () => {
  for (const position of ["G", "D", "M", "A"]) {
    const result = calculateOverallRating({ position, blocks: { creation: 72, finishing: 81, defensive: 64, offensive: 99 } });
    const used = result.usedBlocks.map((entry) => entry.rating);
    assert.ok(result.rating >= Math.min(...used));
    assert.ok(result.rating <= Math.max(...used));
  }
});

test("les pondérations globales reflètent le poste", () => {
  assert.deepEqual(SCORING_CONFIG.OVERALL_BY_POSITION.G, { creation: 0.1, finishing: 0, defensive: 0.75 });
  assert.equal(SCORING_CONFIG.OVERALL_BY_POSITION.GM, undefined);
  assert.equal(SCORING_CONFIG.OVERALL_BY_POSITION.D.defensive, 0.4);
  assert.equal(SCORING_CONFIG.OVERALL_BY_POSITION.D.creation, 0.3);
  assert.equal(SCORING_CONFIG.OVERALL_BY_POSITION.A.finishing, 0.4);
  assert.equal(SCORING_CONFIG.OVERALL_BY_POSITION.A.defensive, 0.2);
  assert.equal(SCORING_CONFIG.OVERALL_BY_POSITION.M.creation, 0.4);
  assert.equal(SCORING_CONFIG.OVERALL_MATCH_GRADE_WEIGHT, 0.15);
});

test("le dernier poste SportEasy est utilisé sans créer de profil hybride", () => {
  assert.equal(normalizePosition(null), "M");
  assert.equal(normalizePosition(""), "M");
  assert.equal(normalizePosition("G"), "G");
  assert.equal(normalizePosition("Gardien / joueur"), "M");
  assert.equal(normalizePosition("G/M"), "M");
  assert.equal(normalizePosition("M/G"), "G");
  assert.equal(normalizePosition("Attaquant, Défenseur"), "D");
});

test("les bonus officiels sont +2, +2 et +4, cumulables sans plafond intermédiaire", () => {
  assert.deepEqual(calculateAwardBonus([{ type: "top_scorer" }]), {
    rawBonus: 2,
    bonus: 2,
    awards: [{ type: "top_scorer" }],
  });
  assert.equal(calculateAwardBonus([{ type: "top_assist_provider" }]).bonus, 2);
  assert.equal(calculateAwardBonus([{ type: "player_of_year" }]).bonus, 4);
  assert.equal(calculateAwardBonus([{ type: "team_trophy" }]).bonus, 0);
  assert.equal(calculateAwardBonus(Array.from({ length: 10 }, () => ({ type: "player_of_year" }))).bonus, 40);
});

test("le bonus de palmarès augmente seulement la note globale et ne dépasse jamais 99", () => {
  const periodMatches = Array.from({ length: 15 }, (_, index) => scoringMatch({
    id: index + 1,
    participants: ["1", "2"],
    goals: { "1": 1 },
  }));
  const baseArgs = {
    periodKey: "allTime",
    periodMatches,
    players: players(),
    positionsById: new Map([["1", "ATT"], ["2", "DEF"]]),
    careerMatchesByPlayer: new Map([["1", 15], ["2", 15]]),
  };
  const withoutAwards = calculatePeriodPerformanceRatings(baseArgs).players["1"].performance;
  const withAwards = calculatePeriodPerformanceRatings({
    ...baseArgs,
    awardsByPlayer: new Map([["1", [{ type: "player_of_year" }, { type: "top_scorer" }]]]),
  }).players["1"].performance;
  assert.equal(withAwards.awardBonus, 6);
  assert.equal(withAwards.overall, Math.min(99, withoutAwards.overall + 6));
  assert.equal(withAwards.creation, withoutAwards.creation);
  assert.equal(withAwards.finishing, withoutAwards.finishing);
  assert.equal(withAwards.defensive, withoutAwards.defensive);
});

test("la note moyenne des matchs pèse 15 % de la note générale lorsqu'elle existe", () => {
  const withoutGrade = calculateOverallRating({ position: "A", blocks: { creation: 50, finishing: 50, defensive: 50 }, matchesPlayed: 10 });
  const withGrade = calculateOverallRating({ position: "A", blocks: { creation: 50, finishing: 50, defensive: 50 }, matchesPlayed: 10, matchAverageRating: 99 });
  assert.equal(withoutGrade.rating, 50);
  assert.ok(withGrade.rating > withoutGrade.rating);
  assert.equal(withGrade.usedBlocks.find(({ block }) => block === "matchAverage")?.weight, 0.15);
});

test("les Hommes du match distinguent les performances dominantes sans modifier les poids de base", () => {
  assert.equal(calculateManOfTheMatchBonus(null), 0);
  assert.equal(calculateManOfTheMatchBonus(50), 0);
  assert.ok(calculateManOfTheMatchBonus(75) > 0);
  assert.equal(calculateManOfTheMatchBonus(99), 3);
});

test("la fréquence des Hommes du match compte davantage que leur simple total", () => {
  const score = calculateManOfTheMatchRating({
    total: 2,
    matches: 10,
    totalPopulation: [0, 1, 2],
    ratePopulation: [0, 0.1, 0.2],
  });
  assert.equal(score.components.find(({ key }) => key === "total")?.weight, 0.35);
  assert.equal(score.components.find(({ key }) => key === "perMatch")?.weight, 0.65);
  assert.equal(score.rating, 99);
});

test("le bonus d'ancienneté reste léger, progressif et plafonné", () => {
  assert.equal(calculateTenureBonus(1), 0);
  assert.equal(calculateTenureBonus(2), 0.5);
  assert.equal(calculateTenureBonus(4), 1.5);
  assert.equal(calculateTenureBonus(7), 3);
  assert.equal(calculateTenureBonus(20), 3);
});

test("sans poste, une pondération générale neutre produit l'indice global à partir de 10 matchs", () => {
  const matches = Array.from({ length: 10 }, (_, index) => scoringMatch({ id: index + 1, participants: ["1", "2"] }));
  const result = calculatePeriodPerformanceRatings({
    periodKey: "allTime",
    periodMatches: matches,
    players: players(),
    careerMatchesByPlayer: new Map([["1", 10], ["2", 10]]),
  }).players["1"].performance;
  assert.ok(Number.isInteger(result.creation));
  assert.ok(Number.isInteger(result.defensive));
  assert.ok(Number.isInteger(result.overall));
});

test("la note générale reste indisponible avant 10 matchs sur la période", () => {
  const matches = Array.from({ length: 9 }, (_, index) => scoringMatch({ id: index + 1, participants: ["1", "2"] }));
  const result = calculatePeriodPerformanceRatings({
    periodKey: "previous",
    periodMatches: matches,
    players: players(),
    positionsById: new Map([["1", "ATT"], ["2", "DEF"]]),
    careerMatchesByPlayer: new Map([["1", 30], ["2", 30]]),
  }).players["1"].performance;
  assert.ok(Number.isInteger(result.creation));
  assert.equal(result.overall, null);
});

test("un ancien joueur à 9 matchs n'est ni noté ni intégré au benchmark", () => {
  const matches = Array.from({ length: 9 }, (_, index) => scoringMatch({ id: index + 1, participants: ["1", "2"] }));
  const result = calculatePeriodPerformanceRatings({
    periodKey: "allTime",
    periodMatches: matches,
    players: players(false),
    positionsById: new Map([["1", "ATT"], ["2", "ATT"]]),
    careerMatchesByPlayer: new Map([["1", 9], ["2", 9]]),
  });
  assert.deepEqual(result.players["1"].performance, {
    creation: null,
    finishing: null,
    offensive: null,
    defensive: null,
    overall: null,
    awardBonus: 0,
    tenureBonus: 0,
    manOfTheMatchBonus: 0,
    confidence: null,
    rankings: { creation: null, finishing: null, offensive: null, defensive: null, overall: null },
  });
  assert.equal(result.players["2"].performance.rankings.finishing.eligiblePlayers, 1);
});

test("un ancien joueur à 10 matchs peut être évalué", () => {
  const matches = Array.from({ length: 10 }, (_, index) => scoringMatch({ id: index + 1, participants: ["1", "2"] }));
  const result = calculatePeriodPerformanceRatings({
    periodKey: "allTime",
    periodMatches: matches,
    players: players(false),
    positionsById: new Map([["1", "ATT"], ["2", "ATT"]]),
    careerMatchesByPlayer: new Map([["1", 10], ["2", 10]]),
  }).players["1"].performance;
  assert.ok(Number.isInteger(result.creation));
  assert.ok(Number.isInteger(result.overall));
});

test("la saison actuelle note dès une apparition, sans changer les seuils historiques", () => {
  const args = {
    players: players(),
    periodMatches: [scoringMatch({ participants: ["1"], goals: { "1": 2 }, assists: { "1": 1 } })],
    averageRatingsByPlayer: new Map([["1", 7]]),
  };
  const current = calculatePeriodPerformanceRatings({ ...args, periodKey: "current" });
  assert.ok(Number.isInteger(current.players["1"].performance.overall));
  assert.equal(current.players["1"].performance.confidence, 1 / 15);
  assert.equal(current.players["2"].performance.overall, null);
  for (const periodKey of ["previous", "allTime"]) {
    assert.equal(calculatePeriodPerformanceRatings({ ...args, periodKey }).players["1"].performance.overall, null);
  }
});

test("changer de période recalcule réellement la hiérarchie", () => {
  const period = (leader) => Array.from({ length: 15 }, (_, index) => scoringMatch({
    id: index + 1,
    participants: ["1", "2"],
    goals: { [leader]: 1 },
  }));
  const args = {
    players: players(),
    positionsById: new Map([["1", "ATT"], ["2", "ATT"]]),
    careerMatchesByPlayer: new Map([["1", 15], ["2", 15]]),
  };
  const first = calculatePeriodPerformanceRatings({ ...args, periodKey: "current", periodMatches: period("1") });
  const second = calculatePeriodPerformanceRatings({ ...args, periodKey: "previous", periodMatches: period("2") });
  assert.ok(first.players["1"].performance.finishing > first.players["2"].performance.finishing);
  assert.ok(second.players["1"].performance.finishing < second.players["2"].performance.finishing);
});

test("toute note effectivement calculée est un entier de 1 à 99, jamais 0 ou 100", () => {
  const periodMatches = Array.from({ length: 15 }, (_, index) => scoringMatch({
    id: index + 1,
    participants: ["1", "2"],
    goals: { "1": index % 2, "2": index % 3 === 0 ? 1 : 0 },
    assists: { "1": index % 4 === 0 ? 1 : 0 },
  }));
  const result = calculatePeriodPerformanceRatings({
    periodKey: "allTime",
    periodMatches,
    players: players(),
    positionsById: new Map([["1", "ATT"], ["2", "DEF"]]),
    careerMatchesByPlayer: new Map([["1", 15], ["2", 15]]),
  });
  for (const player of Object.values(result.players)) {
    for (const value of [player.performance.creation, player.performance.finishing, player.performance.offensive, player.performance.defensive, player.performance.overall]) {
      if (value === null) continue;
      assert.ok(Number.isInteger(value));
      assert.ok(value >= 1 && value <= 99);
      assert.notEqual(value, 0);
      assert.notEqual(value, 100);
    }
  }
});
