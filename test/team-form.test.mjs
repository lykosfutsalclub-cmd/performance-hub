import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSeasonTeamSeries,
  calculateMatchTeamForm,
  isAnonymousOpponent,
  opponentDifficulty,
  summarizeTeamForm,
} from "../src/team/team-form.mjs";

function match(id, day, opponent, teamScore, opponentScore, grades = [], categoryType = "friendly_match", eventRating = null) {
  return {
    eventId: String(id),
    day,
    startAt: `${day}T20:00:00+02:00`,
    name: `Lykos - ${opponent}`,
    category: { type: categoryType, name: categoryType },
    opponent: { id: opponent, name: opponent },
    score: { team: teamScore, opponent: opponentScore },
    playerStatistics: grades.map((grade, index) => ({ profileId: String(index + 1), metrics: { player_grade: String(grade) } })),
    eventRating: eventRating === null ? null : { average: eventRating, voteCount: 1, scaleMax: 6 },
  };
}

test("les équipes anonymes reçoivent une difficulté médiane", () => {
  assert.equal(isAnonymousOpponent("Équipe Anonyme Le Complexe"), true);
  assert.deepEqual(opponentDifficulty(match(3, "2026-01-03", "Équipe Anonyme Le Complexe", 4, 3), []), {
    value: 50,
    sampleSize: 0,
    policy: "anonymous-median",
  });
});

test("la difficulté repose sur les confrontations précédentes", () => {
  const previous = [
    match(1, "2025-01-01", "FC Fort", 1, 3),
    match(2, "2025-02-01", "FC Fort", 2, 2),
  ];
  const difficulty = opponentDifficulty(match(3, "2026-01-01", "FC Fort", 3, 1), previous);
  assert.equal(difficulty.value, 83.3);
  assert.equal(difficulty.sampleSize, 2);
  assert.equal(difficulty.policy, "previous-head-to-head");
});

test("la note d'équipe utilise la vraie note collective SportEasy sur 6", () => {
  const rating = calculateMatchTeamForm(match(1, "2026-01-01", "FC Test", 4, 2, [8, 6, 7], "friendly_match", 4.5));
  assert.equal(rating.playerGradeAverage, 7);
  assert.equal(rating.playerGradeCount, 3);
  assert.equal(rating.eventRatingAverage, 4.5);
  assert.equal(rating.eventRatingVoteCount, 1);
  assert.ok(Number.isFinite(rating.value));
});

test("une note collective absente reste absente", () => {
  const rating = calculateMatchTeamForm(match(1, "2026-01-01", "FC Test", 4, 2, [8]));
  assert.equal(rating.eventRatingAverage, null);
  assert.equal(rating.eventRatingVoteCount, null);
});

test("la série permet de comparer les fluctuations et résume les dix derniers matchs", () => {
  const matches = [
    match(1, "2026-01-01", "FC A", 3, 1, [8, 7]),
    match(2, "2026-01-08", "FC B", 1, 2, [5, 6]),
  ];
  const series = buildSeasonTeamSeries(matches);
  assert.equal(series.length, 2);
  assert.equal(series[1].winRate, 50);
  assert.equal(series[1].goalsForPerMatch, 2);
  const form = summarizeTeamForm(series);
  assert.equal(form.matchCount, 2);
  assert.equal(form.eventRatingCoverage, 0);
  assert.equal(form.gradeCoverage, 100);
});
