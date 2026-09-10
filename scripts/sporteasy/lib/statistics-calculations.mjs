export function roundMetric(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function safeDivide(numerator, denominator, digits = 2) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return roundMetric(numerator / denominator, digits);
}

export function calculateGoalDifference(goalsFor, goalsAgainst) {
  if (!Number.isFinite(goalsFor) || !Number.isFinite(goalsAgainst)) return null;
  return goalsFor - goalsAgainst;
}

export function calculateGoalsPerMatch(goals, matchesPlayed) {
  return safeDivide(goals, matchesPlayed, 2);
}

export function calculateWinRate(wins, matchesPlayed) {
  const ratio = safeDivide(wins, matchesPlayed, 4);
  return ratio === null ? null : roundMetric(ratio * 100, 1);
}

export function calculateAverage(values, digits = 2) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return safeDivide(values.reduce((sum, value) => sum + value, 0), values.length, digits);
}

export function calculateLongestStreak(outcomes, acceptedOutcomes) {
  if (!Array.isArray(outcomes) || !(acceptedOutcomes instanceof Set)) return null;
  let longest = 0;
  let current = 0;
  for (const outcome of outcomes) {
    if (acceptedOutcomes.has(outcome)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}
