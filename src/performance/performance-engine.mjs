import { SCORING_CONFIG } from "./scoring-config.mjs";
import { classifyScoringMatch, scoringMatchAudit, scoringMatchWeight } from "./match-weights.mjs";
import { percentile } from "./percentile-engine.mjs";
import {
  adjustRatingForSample,
  clampRating,
  normalizePosition,
  ratingFromPercentile,
  safeDivide,
  sampleConfidence,
  sum,
} from "./performance-utils.mjs";

function finiteValues(items, valueOf) {
  return items.map(valueOf).filter(Number.isFinite);
}

function matchTotal(appearances, valueOf) {
  const values = appearances.map(valueOf);
  return values.length && values.every(Number.isFinite)
    ? sum(values)
    : null;
}

function matchWeightTotal(appearances) {
  const weights = appearances.map((appearance) => appearance.scoringWeight);
  return weights.length && weights.every(Number.isFinite) ? sum(weights) : null;
}

function weightedTotal(appearances, valueOf) {
  const values = appearances.map(valueOf);
  const weightTotal = matchWeightTotal(appearances);
  if (weightTotal === null || !values.every(Number.isFinite)) return null;
  return sum(appearances.map((appearance, index) => values[index] * appearance.scoringWeight));
}

function weightedRate(appearances, valueOf) {
  return safeDivide(weightedTotal(appearances, valueOf), matchWeightTotal(appearances));
}

function weightedFrequency(appearances, predicate) {
  const weightTotal = matchWeightTotal(appearances);
  if (weightTotal === null) return null;
  return safeDivide(
    sum(appearances.map((appearance) => (predicate(appearance) ? appearance.scoringWeight : 0))),
    weightTotal,
  );
}

function weightedRecord(appearances, valueOf, mode = "max", direction = "higher") {
  const values = appearances.map(valueOf);
  if (!values.length || !values.every(Number.isFinite) || matchWeightTotal(appearances) === null) return null;
  const weightedValues = appearances.map((appearance, index) => (
    direction === "lower"
      ? values[index] / appearance.scoringWeight
      : values[index] * appearance.scoringWeight
  ));
  return mode === "min" ? Math.min(...weightedValues) : Math.max(...weightedValues);
}

function weightedPositiveStreak(appearances, valueOf) {
  if (
    !appearances.length
    || appearances.some((appearance) => !Number.isFinite(valueOf(appearance)) || !Number.isFinite(appearance.scoringWeight))
  ) return null;
  let current = 0;
  let longest = 0;
  for (const appearance of appearances) {
    if (valueOf(appearance) >= 1) {
      current += appearance.scoringWeight;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function weightedTeamShare(appearances, playerValueOf, teamValueOf) {
  const covered = appearances.filter((appearance) =>
    Number.isFinite(playerValueOf(appearance)) && Number.isFinite(teamValueOf(appearance)),
  );
  const numerator = weightedTotal(covered, playerValueOf);
  const denominator = weightedTotal(covered, teamValueOf);
  return safeDivide(numerator, denominator);
}

function contribution(appearance) {
  const detail = appearance.playerDetail;
  return Number.isFinite(detail?.goals) && Number.isFinite(detail?.assists)
    ? detail.goals + detail.assists
    : null;
}

export function buildPerformanceMetrics({ playerId, periodMatches }) {
  const id = String(playerId);
  const recognized = (periodMatches ?? [])
    .map((match) => ({
      ...match,
      scoringType: classifyScoringMatch(match),
      scoringWeight: scoringMatchWeight(match),
    }))
    .filter((match) => Number.isFinite(match.scoringWeight))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const appearances = recognized
    .filter((match) => match.participants.has(id))
    .map((match) => ({ ...match, playerDetail: match.playerDetails[id] ?? null }));
  const recent = appearances.slice(-5);
  const goals = (appearance) => appearance.playerDetail?.goals;
  const assists = (appearance) => appearance.playerDetail?.assists;
  const teamContributions = (appearance) => Number.isFinite(appearance.goalsFor) && Number.isFinite(appearance.teamAssists)
    ? appearance.goalsFor + appearance.teamAssists
    : null;

  const scoredPeriodMatches = recognized.filter((match) => Number.isFinite(match.goalsAgainst));
  const scoredAppearances = appearances.filter((match) => Number.isFinite(match.goalsAgainst));
  const appearanceIds = new Set(appearances.map((match) => match.eventId));
  const scoredWithoutPlayer = scoredPeriodMatches.filter((match) => !appearanceIds.has(match.eventId));
  const clubAverage = weightedRate(scoredPeriodMatches, (match) => match.goalsAgainst);
  const goalsAgainstPerMatch = weightedRate(scoredAppearances, (match) => match.goalsAgainst);
  const goalsAgainstWithoutPlayer = weightedRate(scoredWithoutPlayer, (match) => match.goalsAgainst);
  const betterDefended = clubAverage === null
    ? []
    : scoredAppearances.filter((match) => match.goalsAgainst < clubAverage);

  return {
    matchCount: appearances.length,
    matchWeightSum: matchWeightTotal(appearances) ?? 0,
    competitionBreakdown: Object.fromEntries(
      Object.keys(SCORING_CONFIG.MATCH_WEIGHTS).map((type) => [type, appearances.filter((match) => match.scoringType === type).length]),
    ),
    metrics: {
      assists: weightedTotal(appearances, assists),
      assistsPerMatch: weightedRate(appearances, assists),
      assistFrequency: weightedFrequency(appearances, (match) => assists(match) >= 1),
      teamAssistShare: weightedTeamShare(appearances, assists, (match) => match.teamAssists),
      recentAssists: weightedTotal(recent, assists),
      maxAssists: weightedRecord(appearances, assists),
      assistStreak: weightedPositiveStreak(appearances, assists),
      goals: weightedTotal(appearances, goals),
      goalsPerMatch: weightedRate(appearances, goals),
      scoringFrequency: weightedFrequency(appearances, (match) => goals(match) >= 1),
      teamGoalShare: weightedTeamShare(appearances, goals, (match) => match.goalsFor),
      recentGoals: weightedTotal(recent, goals),
      maxGoals: weightedRecord(appearances, goals),
      scoringStreak: weightedPositiveStreak(appearances, goals),
      contributions: weightedTotal(appearances, contribution),
      contributionsPerMatch: weightedRate(appearances, contribution),
      decisiveFrequency: weightedFrequency(appearances, (match) => contribution(match) >= 1),
      teamContributionShare: weightedTeamShare(appearances, contribution, teamContributions),
      recentContributions: weightedTotal(recent, contribution),
      maxContributions: weightedRecord(appearances, contribution),
      decisiveStreak: weightedPositiveStreak(appearances, contribution),
      goalsAgainstPerMatch,
      defensiveDifference:
        goalsAgainstWithoutPlayer === null || goalsAgainstPerMatch === null
          ? null
          : goalsAgainstWithoutPlayer - goalsAgainstPerMatch,
      betterDefendedFrequency:
        clubAverage === null || !scoredAppearances.length
          ? null
          : weightedFrequency(scoredAppearances, (match) => match.goalsAgainst < clubAverage),
      betterDefendedMatches:
        clubAverage === null || !scoredAppearances.length
          ? null
          : sum(betterDefended.map((match) => match.scoringWeight)),
      bestDefensiveGame: weightedRecord(scoredAppearances, (match) => match.goalsAgainst, "min", "lower"),
      worstDefensiveGame: weightedRecord(scoredAppearances, (match) => match.goalsAgainst, "max", "lower"),
    },
  };
}

function metricRating({ playerRecord, metricKey, definition, eligibleRecords }) {
  const value = playerRecord.performanceMetrics.metrics[metricKey];
  if (!Number.isFinite(value)) return null;
  const globalPopulation = finiteValues(eligibleRecords, (record) => record.performanceMetrics.metrics[metricKey]);
  const metricPercentile = percentile(value, globalPopulation, definition.direction);
  return ratingFromPercentile(metricPercentile);
}

function calculateBlock({ blockKey, playerRecord, eligibleRecords }) {
  const definitions = SCORING_CONFIG.BLOCKS[blockKey];
  const components = Object.entries(definitions).map(([metricKey, definition]) => ({
    metricKey,
    weight: definition.weight,
    rating: metricRating({ playerRecord, metricKey, definition, eligibleRecords }),
  }));
  const available = components.filter((component) => Number.isFinite(component.rating));
  const availableWeight = sum(available.map((component) => component.weight));
  if (availableWeight + Number.EPSILON < SCORING_CONFIG.MIN_BLOCK_WEIGHT_COVERAGE) {
    return { rating: null, calculatedRating: null, availableWeight, components };
  }
  const calculatedRating = sum(available.map((component) => component.rating * component.weight)) / availableWeight;
  const rating = playerRecord.player.isCurrent
    ? adjustRatingForSample(calculatedRating, playerRecord.confidence)
    : clampRating(calculatedRating);
  return { rating, calculatedRating, availableWeight, components };
}

export function calculateOverallRating({
  position,
  blocks,
  matchesPlayed = SCORING_CONFIG.MIN_OVERALL_MATCHES,
  minimumMatches = SCORING_CONFIG.MIN_OVERALL_MATCHES,
  matchAverageRating = null,
}) {
  if (!Number.isFinite(matchesPlayed) || matchesPlayed < minimumMatches) {
    return { rating: null, availableWeight: 0, usedBlocks: [], reason: "under-minimum-matches" };
  }
  const weights = SCORING_CONFIG.OVERALL_BY_POSITION[position]
    ?? SCORING_CONFIG.OVERALL_BY_POSITION.DEFAULT;
  const gradeWeight = Number.isFinite(matchAverageRating) ? SCORING_CONFIG.OVERALL_MATCH_GRADE_WEIGHT : 0;
  const usedBlocks = Object.entries(weights)
    .filter(([, weight]) => weight > 0)
    .map(([block, weight]) => ({ block, weight, rating: blocks[block] }))
    .filter((entry) => Number.isFinite(entry.rating));
  if (gradeWeight > 0) usedBlocks.push({ block: "matchAverage", weight: gradeWeight, rating: matchAverageRating });
  const availableWeight = sum(usedBlocks.map((entry) => entry.weight));
  if (availableWeight + Number.EPSILON < SCORING_CONFIG.MIN_OVERALL_WEIGHT_COVERAGE) {
    return { rating: null, availableWeight, usedBlocks, reason: "insufficient-block-coverage" };
  }
  const rating = clampRating(sum(usedBlocks.map((entry) => entry.rating * entry.weight)) / availableWeight);
  const floor = Math.min(...usedBlocks.map((entry) => entry.rating));
  const ceiling = Math.max(...usedBlocks.map((entry) => entry.rating));
  return { rating: Math.min(ceiling, Math.max(floor, rating)), availableWeight, usedBlocks, reason: null };
}

export function calculateManOfTheMatchRating({ total, matches, totalPopulation = [], ratePopulation = [] }) {
  const rate = safeDivide(total, matches);
  const components = [
    {
      key: "total",
      weight: SCORING_CONFIG.MAN_OF_MATCH_COMPONENTS.total,
      rating: Number.isFinite(total) ? ratingFromPercentile(percentile(total, totalPopulation, "higher")) : null,
    },
    {
      key: "perMatch",
      weight: SCORING_CONFIG.MAN_OF_MATCH_COMPONENTS.perMatch,
      rating: Number.isFinite(rate) ? ratingFromPercentile(percentile(rate, ratePopulation, "higher")) : null,
    },
  ].filter((component) => Number.isFinite(component.rating));
  const availableWeight = sum(components.map((component) => component.weight));
  return {
    rating: availableWeight > 0
      ? clampRating(sum(components.map((component) => component.rating * component.weight)) / availableWeight)
      : null,
    total,
    perMatch: rate,
    components,
  };
}

export function calculateTenureBonus(tenureSeasons) {
  if (!Number.isFinite(tenureSeasons) || tenureSeasons < 1) return 0;
  return Math.min(
    SCORING_CONFIG.TENURE_BONUS_MAX,
    Math.max(0, tenureSeasons - 1) * SCORING_CONFIG.TENURE_BONUS_PER_ADDITIONAL_SEASON,
  );
}

export function calculateManOfTheMatchBonus(rating) {
  if (!Number.isFinite(rating) || rating <= SCORING_CONFIG.RATING_MEDIAN) return 0;
  return Math.min(
    SCORING_CONFIG.MAN_OF_MATCH_BONUS_MAX,
    ((rating - SCORING_CONFIG.RATING_MEDIAN) / (SCORING_CONFIG.RATING_MAX - SCORING_CONFIG.RATING_MEDIAN))
      * SCORING_CONFIG.MAN_OF_MATCH_BONUS_MAX,
  );
}

export function calculateAwardBonus(awards = []) {
  const recognized = awards.filter((award) => Number.isFinite(SCORING_CONFIG.AWARD_BONUSES[award.type]));
  const rawBonus = sum(recognized.map((award) => SCORING_CONFIG.AWARD_BONUSES[award.type]));
  return {
    rawBonus,
    bonus: rawBonus,
    awards: recognized,
  };
}

function addRatingRanks(records) {
  for (const key of ["creation", "finishing", "offensive", "defensive", "overall"]) {
    const candidates = records
      .filter((record) => Number.isFinite(record.performance[key]))
      .sort((left, right) => right.performance[key] - left.performance[key] || left.player.displayName.localeCompare(right.player.displayName, "fr"));
    let previousValue = null;
    let previousRank = 0;
    candidates.forEach((record, index) => {
      const value = record.performance[key];
      const rank = value === previousValue ? previousRank : index + 1;
      record.performance.rankings[key] = { rank, eligiblePlayers: candidates.length, value };
      previousValue = value;
      previousRank = rank;
    });
  }
}

function ratingIssues(records) {
  const issues = [];
  for (const record of records) {
    const ratings = ["creation", "finishing", "offensive", "defensive", "overall"]
      .map((key) => [key, record.performance[key]])
      .filter(([, value]) => value !== null);
    for (const [key, value] of ratings) {
      if (!Number.isInteger(value) || value < 1 || value > 99) {
        issues.push({ severity: "error", code: "rating-out-of-range", playerId: record.playerId, key, value });
      }
    }
    const overall = record.performance.overall;
    const overallTrace = record.trace.overall;
    const used = overallTrace.usedBlocks.map((entry) => entry.rating);
    if (overallTrace.baseRating !== null && used.length && (overallTrace.baseRating < Math.min(...used) || overallTrace.baseRating > Math.max(...used))) {
      issues.push({ severity: "error", code: "base-overall-outside-block-range", playerId: record.playerId, baseRating: overallTrace.baseRating, used });
    }
    if (!Number.isInteger(overallTrace.awardBonus) || overallTrace.awardBonus < 0) {
      issues.push({ severity: "error", code: "award-bonus-out-of-range", playerId: record.playerId, awardBonus: overallTrace.awardBonus });
    }
    if (!Number.isFinite(overallTrace.tenureBonus) || overallTrace.tenureBonus < 0 || overallTrace.tenureBonus > SCORING_CONFIG.TENURE_BONUS_MAX) {
      issues.push({ severity: "error", code: "tenure-bonus-out-of-range", playerId: record.playerId, tenureBonus: overallTrace.tenureBonus });
    }
    if (!Number.isFinite(overallTrace.manOfTheMatchBonus) || overallTrace.manOfTheMatchBonus < 0 || overallTrace.manOfTheMatchBonus > SCORING_CONFIG.MAN_OF_MATCH_BONUS_MAX) {
      issues.push({ severity: "error", code: "man-of-match-bonus-out-of-range", playerId: record.playerId, manOfTheMatchBonus: overallTrace.manOfTheMatchBonus });
    }
    if (overall !== null && overall !== clampRating(overallTrace.baseRating + overallTrace.awardBonus + overallTrace.tenureBonus + overallTrace.manOfTheMatchBonus)) {
      issues.push({ severity: "error", code: "overall-metron-bonus-mismatch", playerId: record.playerId, overall, overallTrace });
    }
  }
  return issues;
}

export function calculatePeriodPerformanceRatings({
  periodKey,
  periodMatches,
  players,
  positionsById = new Map(),
  careerMatchesByPlayer = new Map(),
  awardsByPlayer = new Map(),
  averageRatingsByPlayer = new Map(),
  manOfTheMatchByPlayer = new Map(),
  tenureSeasonsByPlayer = new Map(),
  minimumOverallMatches = periodKey === "current"
    ? SCORING_CONFIG.CURRENT_MIN_OVERALL_MATCHES
    : SCORING_CONFIG.MIN_OVERALL_MATCHES,
}) {
  const records = players.map((player) => {
    const playerId = String(player.sporteasyId);
    const careerMatches = careerMatchesByPlayer.get(playerId) ?? 0;
    const formerEligible = player.isCurrent || careerMatches >= SCORING_CONFIG.FORMER_MIN_CAREER_MATCHES;
    const performanceMetrics = buildPerformanceMetrics({ playerId, periodMatches });
    return {
      playerId,
      player,
      position: normalizePosition(positionsById.get(playerId)),
      careerMatches,
      formerEligible,
      confidence: formerEligible
        ? (player.isCurrent ? sampleConfidence(performanceMetrics.matchCount) : 1)
        : null,
      performanceMetrics,
      averageMatchRating: averageRatingsByPlayer.get(playerId) ?? null,
      manOfTheMatch: manOfTheMatchByPlayer.get(playerId) ?? { total: null, matches: null },
      tenureSeasons: tenureSeasonsByPlayer.get(playerId) ?? 1,
    };
  });
  const eligibleRecords = records.filter((record) => record.formerEligible);
  const averageRatingPopulation = finiteValues(eligibleRecords, (record) => record.averageMatchRating);
  const manOfTheMatchTotalPopulation = finiteValues(eligibleRecords, (record) => record.manOfTheMatch.total);
  const manOfTheMatchRatePopulation = finiteValues(
    eligibleRecords,
    (record) => safeDivide(record.manOfTheMatch.total, record.manOfTheMatch.matches),
  );

  for (const record of records) {
    const emptyPerformance = {
      creation: null,
      finishing: null,
      offensive: null,
      defensive: null,
      overall: null,
      awardBonus: 0,
      tenureBonus: 0,
      manOfTheMatchBonus: 0,
      confidence: record.confidence,
      rankings: { creation: null, finishing: null, offensive: null, defensive: null, overall: null },
    };
    if (!record.formerEligible) {
      record.performance = { ...emptyPerformance, confidence: null };
      record.trace = { reason: "former-player-under-minimum-career-matches", performanceMetrics: record.performanceMetrics, blocks: {}, overall: { rating: null, baseRating: null, awardBonus: 0, rawAwardBonus: 0, tenureBonus: 0, tenureSeasons: record.tenureSeasons, manOfTheMatchBonus: 0, awards: [], availableWeight: 0, usedBlocks: [] } };
      continue;
    }
    const blockResults = Object.fromEntries(
      Object.keys(SCORING_CONFIG.BLOCKS).map((blockKey) => [
        blockKey,
        calculateBlock({ blockKey, playerRecord: record, eligibleRecords }),
      ]),
    );
    const blocks = Object.fromEntries(Object.entries(blockResults).map(([key, result]) => [key, result.rating]));
    const averageMatchRatingScore = Number.isFinite(record.averageMatchRating)
      ? ratingFromPercentile(percentile(record.averageMatchRating, averageRatingPopulation, "higher"))
      : null;
    const manOfTheMatchScore = calculateManOfTheMatchRating({
      total: record.manOfTheMatch.total,
      matches: record.manOfTheMatch.matches,
      totalPopulation: manOfTheMatchTotalPopulation,
      ratePopulation: manOfTheMatchRatePopulation,
    });
    const overall = calculateOverallRating({
      position: record.position,
      blocks,
      matchesPlayed: record.performanceMetrics.matchCount,
      minimumMatches: minimumOverallMatches,
      matchAverageRating: averageMatchRatingScore,
    });
    const awardBonus = calculateAwardBonus(awardsByPlayer.get(record.playerId) ?? []);
    const appliedAwardBonus = overall.rating === null ? 0 : awardBonus.bonus;
    const tenureBonus = overall.rating === null ? 0 : calculateTenureBonus(record.tenureSeasons);
    const manOfTheMatchBonus = overall.rating === null ? 0 : calculateManOfTheMatchBonus(manOfTheMatchScore.rating);
    const finalOverall = overall.rating === null ? null : clampRating(overall.rating + appliedAwardBonus + tenureBonus + manOfTheMatchBonus);
    record.performance = { ...emptyPerformance, ...blocks, overall: finalOverall, awardBonus: appliedAwardBonus, tenureBonus, manOfTheMatchBonus };
    record.trace = {
      reason: overall.reason,
      periodKey,
      position: record.position,
      careerMatches: record.careerMatches,
      scoringMatches: record.performanceMetrics.matchCount,
      performanceMetrics: record.performanceMetrics,
      averageMatchRating: record.averageMatchRating,
      averageMatchRatingScore,
      manOfTheMatch: manOfTheMatchScore,
      tenureSeasons: record.tenureSeasons,
      blocks: blockResults,
      overall: {
        ...overall,
        baseRating: overall.rating,
        rating: finalOverall,
        awardBonus: appliedAwardBonus,
        rawAwardBonus: awardBonus.rawBonus,
        tenureBonus,
        tenureSeasons: record.tenureSeasons,
        manOfTheMatchBonus,
        awards: awardBonus.awards,
      },
    };
  }

  addRatingRanks(records);
  const warnings = scoringMatchAudit(periodMatches);
  const errors = ratingIssues(records);
  return {
    players: Object.fromEntries(records.map((record) => [record.playerId, {
      performance: record.performance,
      trace: record.trace,
    }])),
    validation: {
      status: errors.length ? "invalid" : "valid",
      errorCount: errors.length,
      warningCount: warnings.length,
      issues: [...errors, ...warnings],
    },
  };
}
