import { scoringMatchWeight } from "../performance/match-weights.mjs";

const TEAM_FORM_WEIGHTS = Object.freeze({
  playerGrades: 0.45,
  eventRating: 0.15,
  contextualResult: 0.40,
});

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizedLabel(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ");
}

export function isAnonymousOpponent(name) {
  const label = normalizedLabel(name);
  return /\b(anonyme|anonymous|mix|mixte)\b/.test(label) || label.includes("le complexe");
}

function resultPoints(match) {
  if (match.score.team > match.score.opponent) return 3;
  if (match.score.team < match.score.opponent) return 0;
  return 1;
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((total, value) => total + value, 0) / finite.length : null;
}

export function opponentDifficulty(match, previousMatches) {
  if (isAnonymousOpponent(match.opponent?.name)) return { value: 50, sampleSize: 0, policy: "anonymous-median" };
  const opponentId = String(match.opponent?.id ?? "");
  const opponentName = normalizedLabel(match.opponent?.name);
  const encounters = previousMatches.filter((previous) => {
    if (opponentId && previous.opponent?.id) return String(previous.opponent.id) === opponentId;
    return opponentName && normalizedLabel(previous.opponent?.name) === opponentName;
  });
  if (!encounters.length) return { value: 50, sampleSize: 0, policy: "no-history-median" };
  const lykosPointsRate = encounters.reduce((total, encounter) => total + resultPoints(encounter), 0) / (encounters.length * 3);
  return { value: round((1 - lykosPointsRate) * 100), sampleSize: encounters.length, policy: "previous-head-to-head" };
}

export function calculateMatchTeamForm(match, previousMatches = []) {
  const grades = (match.playerStatistics ?? [])
    .map((player) => Number(player.metrics?.player_grade))
    .filter((grade) => Number.isFinite(grade) && grade >= 0 && grade <= 10);
  const playerGradeAverage = mean(grades);
  const playerGradesScore = playerGradeAverage === null ? null : playerGradeAverage * 10;
  const eventRatingAverage = Number(match.eventRating?.average);
  const eventRatingScore =
    Number.isFinite(eventRatingAverage) && eventRatingAverage >= 1 && eventRatingAverage <= 6
      ? eventRatingAverage / 6 * 100
      : null;
  const difficulty = opponentDifficulty(match, previousMatches);
  const actualResult = resultPoints(match) / 3 * 100;
  const expectedResult = 100 - difficulty.value;
  const goalDifference = match.score.team - match.score.opponent;
  const performanceAgainstExpectation = 50 + (actualResult - expectedResult) * 0.75;
  const rawContextualResult = clamp(performanceAgainstExpectation + clamp(goalDifference, -4, 4) * 2.5);
  const importance = scoringMatchWeight(match) ?? 1;
  const contextualResult = clamp(50 + (rawContextualResult - 50) * importance);
  const components = [
    { key: "playerGrades", value: playerGradesScore, weight: TEAM_FORM_WEIGHTS.playerGrades },
    { key: "eventRating", value: eventRatingScore, weight: TEAM_FORM_WEIGHTS.eventRating },
    { key: "contextualResult", value: contextualResult, weight: TEAM_FORM_WEIGHTS.contextualResult },
  ];
  const available = components.filter((component) => Number.isFinite(component.value));
  const availableWeight = available.reduce((total, component) => total + component.weight, 0);
  const value = availableWeight > 0
    ? round(available.reduce((total, component) => total + component.value * component.weight, 0) / availableWeight)
    : null;
  return {
    value,
    playerGradeAverage: playerGradeAverage === null ? null : round(playerGradeAverage, 2),
    playerGradeCount: grades.length,
    eventRatingAverage: Number.isFinite(eventRatingScore) ? eventRatingAverage : null,
    eventRatingVoteCount: Number.isInteger(match.eventRating?.voteCount)
      ? match.eventRating.voteCount
      : null,
    contextualResult: round(contextualResult),
    opponentDifficulty: difficulty,
    importance,
    availableWeight: round(availableWeight, 2),
  };
}

export function buildSeasonTeamSeries(matches = [], historyPool = matches) {
  const chronological = [...matches].sort((left, right) => String(left.startAt ?? left.day ?? "").localeCompare(String(right.startAt ?? right.day ?? "")));
  const completeHistory = [...historyPool].sort((left, right) => String(left.startAt ?? left.day ?? "").localeCompare(String(right.startAt ?? right.day ?? "")));
  let wins = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const series = chronological.map((match, index) => {
    const matchDate = String(match.startAt ?? match.day ?? "");
    const previousMatches = completeHistory.filter((candidate) => String(candidate.startAt ?? candidate.day ?? "") < matchDate);
    const form = calculateMatchTeamForm(match, previousMatches);
    const played = index + 1;
    const points = resultPoints(match);
    if (points === 3) wins += 1;
    goalsFor += match.score.team;
    goalsAgainst += match.score.opponent;
    const point = {
      eventId: String(match.eventId),
      index: played,
      date: match.day ?? match.startAt ?? null,
      opponent: match.opponent?.name ?? "Adversaire non renseigné",
      score: `${match.score.team}–${match.score.opponent}`,
      winRate: round(wins / played * 100),
      goalsForPerMatch: round(goalsFor / played, 2),
      goalsAgainstPerMatch: round(goalsAgainst / played, 2),
      goalDifferencePerMatch: round((goalsFor - goalsAgainst) / played, 2),
      teamForm: form.value,
      formTrace: form,
    };
    return point;
  });
  return series;
}

export function summarizeTeamForm(series = [], sampleSize = 10) {
  const recent = series.slice(-sampleSize).filter((point) => Number.isFinite(point.teamForm));
  if (!recent.length) return { value: null, label: "INDISPONIBLE", matchCount: 0, eventRatingCoverage: 0, gradeCoverage: 0 };
  const value = round(mean(recent.map((point) => point.teamForm)));
  const eventRatingCoverage = recent.filter((point) => Number.isFinite(point.formTrace?.eventRatingAverage)).length / recent.length;
  const gradeCoverage = recent.filter((point) => Number.isFinite(point.formTrace?.playerGradeAverage)).length / recent.length;
  const label = value >= 85 ? "EXCELLENTE" : value >= 70 ? "BONNE" : value >= 55 ? "POSITIVE" : value >= 40 ? "MOYENNE" : value >= 25 ? "FAIBLE" : "TRÈS FAIBLE";
  return { value, label, matchCount: recent.length, eventRatingCoverage: round(eventRatingCoverage * 100), gradeCoverage: round(gradeCoverage * 100) };
}

export const TEAM_FORM_METHOD = Object.freeze({
  weights: TEAM_FORM_WEIGHTS,
  eventRatingSourceAvailable: false,
  eventRatingScaleMax: 6,
  anonymousOpponentDifficulty: 50,
});
