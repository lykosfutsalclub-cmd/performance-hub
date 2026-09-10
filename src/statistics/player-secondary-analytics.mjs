import { calculatePeriodPerformanceRatings } from "../performance/performance-engine.mjs";
import { SCORING_CONFIG } from "../performance/scoring-config.mjs";

const PRESENT_STATUSES = new Set(["on_time", "late", "present"]);
const PERFORMANCE_KEYS = new Set([
  "player_goals",
  "player_assists",
  "player_match_outcome",
  "player_grade",
  "man_of_event",
  "playing_time",
]);

export const DEFAULT_ANALYTICS_CONFIG = Object.freeze({
  MIN_MATCHS_ENSEMBLE: 5,
  MIN_MATCHES_FOR_RATE_RANKING: 5,
  RECENT_APPEARANCES: 5,
});

export function safeDivide(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
    ? numerator / denominator
    : null;
}

function asFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function completeValues(values) {
  return values.length > 0 && values.every(Number.isFinite);
}

function percentage(numerator, denominator) {
  const ratio = safeDivide(numerator, denominator);
  return ratio === null ? null : ratio * 100;
}

export function calculateLongestPositiveStreak(values) {
  if (!Array.isArray(values) || values.length === 0 || !values.every(Number.isFinite)) return null;
  let longest = 0;
  let current = 0;
  for (const value of values) {
    if (value >= 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export function calculateRecentForm(appearances, count = DEFAULT_ANALYTICS_CONFIG.RECENT_APPEARANCES) {
  if (!Array.isArray(appearances) || !Number.isInteger(count) || count <= 0) return null;
  const recent = appearances.slice(-count);
  if (recent.length === 0 || recent.some((appearance) => !Number.isFinite(appearance.goals) || !Number.isFinite(appearance.assists))) {
    return null;
  }
  const goals = sum(recent.map((appearance) => appearance.goals));
  const assists = sum(recent.map((appearance) => appearance.assists));
  return { appearanceCount: recent.length, goals, assists, contributions: goals + assists };
}

function rowSignalsParticipation(row) {
  if (!row) return false;
  const status = row.metrics?.presence;
  if (status !== null && status !== undefined && status !== "") return PRESENT_STATUSES.has(status);
  return Object.entries(row.metrics ?? {}).some(
    ([key, value]) => PERFORMANCE_KEYS.has(key) && value !== null && value !== undefined,
  );
}

function normalizeMatch(match) {
  const attendanceById = new Map(
    (match.attendance?.entries ?? []).map((entry) => [String(entry.profileId), entry.status]),
  );
  const rowsById = new Map(
    (match.playerStatistics ?? []).filter((row) => row.profileId).map((row) => [String(row.profileId), row]),
  );
  const candidateIds = new Set([...attendanceById.keys(), ...rowsById.keys()]);
  const participants = new Set();
  const participationEvidence = {};

  for (const playerId of candidateIds) {
    const attendanceStatus = attendanceById.get(playerId) ?? null;
    const row = rowsById.get(playerId) ?? null;
    const rowStatus = row?.metrics?.presence ?? null;
    const status = rowStatus ?? attendanceStatus;
    const participated = status
      ? PRESENT_STATUSES.has(status)
      : rowSignalsParticipation(row);
    if (participated) participants.add(playerId);
    participationEvidence[playerId] = {
      participated,
      attendanceStatus,
      statisticsStatus: rowStatus,
      source: status ? (rowStatus ? "event-statistics-presence" : "attendance-ui") : row ? "performance-row" : "none",
    };
  }

  const playerDetails = {};
  for (const playerId of participants) {
    const row = rowsById.get(playerId);
    const rawGoals = asFiniteNumber(row?.metrics?.player_goals);
    const rawAssists = asFiniteNumber(row?.metrics?.player_assists);
    playerDetails[playerId] = {
      goals: rawGoals ?? 0,
      assists: rawAssists ?? 0,
      goalsSource: rawGoals === null ? "sporteasy-omitted-zero" : "event-statistics",
      assistsSource: rawAssists === null ? "sporteasy-omitted-zero" : "event-statistics",
      grade: asFiniteNumber(row?.metrics?.player_grade),
      manOfMatch: row?.metrics?.man_of_event === true ? 1 : row?.metrics?.man_of_event === false ? 0 : null,
    };
  }

  const participantDetails = [...participants].map((playerId) => playerDetails[playerId]);
  const teamAssists = participantDetails.length > 0 && participantDetails.every((detail) => Number.isFinite(detail.assists))
    ? sum(participantDetails.map((detail) => detail.assists))
    : null;

  return {
    eventId: String(match.eventId),
    seasonId: String(match.seasonId),
    date: match.startAt,
    name: match.name ?? null,
    category: match.category ?? {},
    tournamentContainerId: match.tournamentContainerId ?? null,
    outcome: match.outcome,
    goalsFor: asFiniteNumber(match.score?.team),
    goalsAgainst: asFiniteNumber(match.score?.opponent),
    participants,
    participationEvidence,
    playerDetails,
    teamAssists,
  };
}

export function calculateCalendarYearAwards({ matches, playersById, throughYear, excludedYears = [] }) {
  const totalsByYear = new Map();
  const excludedYearSet = new Set(excludedYears.map(Number));

  for (const match of matches) {
    const year = Number(String(match.date ?? "").slice(0, 4));
    if (!Number.isInteger(year) || year > throughYear || excludedYearSet.has(year)) continue;
    if (!totalsByYear.has(year)) totalsByYear.set(year, { matchCount: 0, players: new Map() });
    const yearTotals = totalsByYear.get(year);
    yearTotals.matchCount += 1;

    for (const [playerId, detail] of Object.entries(match.playerDetails ?? {})) {
      if (!yearTotals.players.has(playerId)) {
        yearTotals.players.set(playerId, {
          playerId,
          playerName: playersById.get(playerId)?.displayName ?? `Joueur SportEasy ${playerId}`,
          goals: 0,
          assists: 0,
          manOfMatch: 0,
        });
      }
      const totals = yearTotals.players.get(playerId);
      if (Number.isFinite(detail.goals)) totals.goals += detail.goals;
      if (Number.isFinite(detail.assists)) totals.assists += detail.assists;
      if (Number.isFinite(detail.manOfMatch)) totals.manOfMatch += detail.manOfMatch;
    }
  }

  const byPlayer = {};
  const years = [...totalsByYear.entries()].sort(([left], [right]) => left - right).map(([year, yearTotals]) => {
    const players = [...yearTotals.players.values()];
    const topGoals = players.length ? Math.max(...players.map((player) => player.goals)) : 0;
    const topAssists = players.length ? Math.max(...players.map((player) => player.assists)) : 0;
    const topPlayerScore = players.length ? Math.max(...players.map((player) => player.manOfMatch)) : 0;
    const topScorers = topGoals > 0 ? players.filter((player) => player.goals === topGoals) : [];
    const topAssistProviders = topAssists > 0 ? players.filter((player) => player.assists === topAssists) : [];
    const topPlayers = topPlayerScore > 0 ? players.filter((player) => player.manOfMatch === topPlayerScore) : [];

    for (const [type, winners, total] of [
      ["top_scorer", topScorers, topGoals],
      ["top_assist_provider", topAssistProviders, topAssists],
      ["player_of_year", topPlayers, topPlayerScore],
    ]) {
      for (const winner of winners) {
        if (!byPlayer[winner.playerId]) byPlayer[winner.playerId] = [];
        byPlayer[winner.playerId].push({ type, year, total, tied: winners.length > 1 });
      }
    }

    return {
      year,
      matchCount: yearTotals.matchCount,
      topGoals,
      topAssists,
      topPlayerScore,
      topScorers: topScorers.map(({ playerId, playerName }) => ({ playerId, playerName })),
      topAssistProviders: topAssistProviders.map(({ playerId, playerName }) => ({ playerId, playerName })),
      topPlayers: topPlayers.map(({ playerId, playerName }) => ({ playerId, playerName })),
    };
  });

  for (const awards of Object.values(byPlayer)) {
    awards.sort((left, right) => right.year - left.year || left.type.localeCompare(right.type));
  }
  return { throughYear, excludedYears: [...excludedYearSet].sort(), years, byPlayer };
}

export function buildOfficialPlayerAwards({ officialPlayerAwards, playersById }) {
  const awards = (officialPlayerAwards?.awards ?? [])
    .filter((award) => Number.isInteger(Number(award.year)) && award.playerId && award.type)
    .map((award) => ({
      year: Number(award.year),
      type: award.type,
      playerId: String(award.playerId),
      playerName: playersById.get(String(award.playerId))?.displayName ?? `Joueur SportEasy ${award.playerId}`,
    }));
  const byPlayer = {};
  for (const award of awards) {
    if (!byPlayer[award.playerId]) byPlayer[award.playerId] = [];
    byPlayer[award.playerId].push({ type: award.type, year: award.year });
  }
  for (const playerAwards of Object.values(byPlayer)) {
    playerAwards.sort((left, right) => right.year - left.year || left.type.localeCompare(right.type));
  }
  const years = [...new Set(awards.map((award) => award.year))]
    .sort((left, right) => left - right)
    .map((year) => ({ year, awards: awards.filter((award) => award.year === year) }));
  return {
    source: officialPlayerAwards?.source ?? "Palmarès officiel du club",
    throughYear: officialPlayerAwards?.throughYear ?? Math.max(0, ...awards.map((award) => award.year)),
    excludedYears: [2022],
    years,
    byPlayer,
  };
}

function averageGradesByPlayer(matches) {
  const grades = new Map();
  for (const match of matches) {
    for (const [playerId, detail] of Object.entries(match.playerDetails ?? {})) {
      if (!Number.isFinite(detail.grade)) continue;
      if (!grades.has(playerId)) grades.set(playerId, []);
      grades.get(playerId).push(detail.grade);
    }
  }
  return new Map([...grades.entries()].map(([playerId, values]) => [playerId, sum(values) / values.length]));
}

function calculatePlayerPrimes({ matches, players, positionsById, careerMatchesByPlayer }) {
  const matchesByMonth = new Map();
  for (const match of matches) {
    const monthKey = String(match.date ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    if (!matchesByMonth.has(monthKey)) matchesByMonth.set(monthKey, []);
    matchesByMonth.get(monthKey).push(match);
  }
  const primeByPlayer = {};
  for (const [monthKey, periodMatches] of matchesByMonth) {
    const ratings = calculatePeriodPerformanceRatings({
      periodKey: `prime-${monthKey}`,
      periodMatches,
      players,
      positionsById,
      careerMatchesByPlayer,
      averageRatingsByPlayer: averageGradesByPlayer(periodMatches),
      minimumOverallMatches: 4,
    });
    for (const player of players) {
      const playerId = String(player.sporteasyId);
      const result = ratings.players[playerId];
      const appearances = result?.trace?.scoringMatches ?? 0;
      const rating = result?.performance?.overall;
      if (appearances < 4 || !Number.isFinite(rating)) continue;
      const candidate = {
        month: monthKey,
        year: Number(monthKey.slice(0, 4)),
        monthNumber: Number(monthKey.slice(5, 7)),
        matches: appearances,
        rating,
        averageMatchRating: result.trace.averageMatchRating,
      };
      const current = primeByPlayer[playerId];
      if (!current || candidate.rating > current.rating
        || (candidate.rating === current.rating && candidate.matches > current.matches)
        || (candidate.rating === current.rating && candidate.matches === current.matches && candidate.month > current.month)) {
        primeByPlayer[playerId] = candidate;
      }
    }
  }
  return primeByPlayer;
}

function metricValue(period, playerId, key) {
  const metric = period?.players?.[playerId]?.metrics?.[key];
  return metric?.status === "available" && metric.value !== null ? asFiniteNumber(metric.value) : null;
}

function primaryForPlayer(period, playerId, appearances, recoveredEventIds = new Set()) {
  const completedOutcomes = appearances.filter((appearance) =>
    new Set(["victory", "tie", "defeat"]).has(appearance.outcome),
  );
  const recoveredAppearances = appearances.filter((appearance) => recoveredEventIds.has(appearance.eventId));
  const supplement = (key) => sum(recoveredAppearances.map((appearance) => appearance[key] ?? 0));
  const withSupplement = (key, addition) => {
    const official = metricValue(period, playerId, key);
    return official === null ? null : official + addition;
  };
  return {
    matches: withSupplement("matchesPlayed", recoveredAppearances.length),
    goals: withSupplement("goals", supplement("goals")),
    assists: withSupplement("assists", supplement("assists")),
    manOfTheMatch: withSupplement("manOfMatch", supplement("manOfMatch")),
    averageRating: metricValue(period, playerId, "gradeAverage"),
    detailedAppearanceCount: appearances.length,
    detailedResults: {
      wins: completedOutcomes.filter((appearance) => appearance.outcome === "victory").length,
      draws: completedOutcomes.filter((appearance) => appearance.outcome === "tie").length,
      losses: completedOutcomes.filter((appearance) => appearance.outcome === "defeat").length,
      matchesWithKnownOutcome: completedOutcomes.length,
      coverage: completedOutcomes.length === appearances.length ? "complete" : "partial",
    },
  };
}

function axisFromValues({ total, matches, values, teamTotals, recentCount }) {
  const detailedComplete = completeValues(values);
  const gamesWithValue = detailedComplete ? values.filter((value) => value >= 1).length : null;
  const recentValues = detailedComplete ? values.slice(-recentCount) : [];
  const teamShareIndexes = detailedComplete
    ? teamTotals.map((teamTotal, index) => Number.isFinite(teamTotal) && Number.isFinite(values[index]) ? index : null).filter(Number.isInteger)
    : [];
  const teamShareNumerator = teamShareIndexes.length ? sum(teamShareIndexes.map((index) => values[index])) : null;
  const teamShareDenominator = teamShareIndexes.length ? sum(teamShareIndexes.map((index) => teamTotals[index])) : null;
  return {
    total,
    perGame: safeDivide(total, matches),
    gamesWithValue,
    gameRate: gamesWithValue === null ? null : percentage(gamesWithValue, values.length),
    maxInGame: detailedComplete ? Math.max(...values) : null,
    longestStreak: detailedComplete ? calculateLongestPositiveStreak(values) : null,
    lastAppearances: detailedComplete ? recentValues.length : 0,
    last5Total: detailedComplete ? sum(recentValues) : null,
    teamShare: percentage(teamShareNumerator, teamShareDenominator),
    teamShareCoverage: {
      appearances: values.length,
      appearancesWithTeamTotal: teamShareIndexes.length,
      status: teamShareIndexes.length === 0
        ? "unavailable"
        : teamShareIndexes.length === values.length ? "complete" : "partial",
    },
    detailedComplete,
  };
}

function defensiveAxis(periodMatches, appearances) {
  const scoredPeriodMatches = periodMatches.filter(
    (match) => Number.isFinite(match.goalsFor) && Number.isFinite(match.goalsAgainst),
  );
  const scoredAppearances = appearances.filter((appearance) => Number.isFinite(appearance.goalsAgainst));
  const appearanceIds = new Set(appearances.map((appearance) => appearance.eventId));
  const scoredWithoutPlayer = scoredPeriodMatches.filter((match) => !appearanceIds.has(match.eventId));
  const clubAverage = safeDivide(sum(scoredPeriodMatches.map((match) => match.goalsAgainst)), scoredPeriodMatches.length);
  const goalsAgainst = scoredAppearances.length ? sum(scoredAppearances.map((match) => match.goalsAgainst)) : null;
  const goalsAgainstPerGame = goalsAgainst === null ? null : safeDivide(goalsAgainst, scoredAppearances.length);
  const goalsAgainstWithoutPlayer = scoredWithoutPlayer.length
    ? safeDivide(sum(scoredWithoutPlayer.map((match) => match.goalsAgainst)), scoredWithoutPlayer.length)
    : null;
  const belowAverage = clubAverage === null || scoredAppearances.length === 0
    ? null
    : scoredAppearances.filter((match) => match.goalsAgainst < clubAverage).length;
  return {
    goalsAgainst,
    goalsAgainstPerGame,
    bestDefensiveGame: scoredAppearances.length ? Math.min(...scoredAppearances.map((match) => match.goalsAgainst)) : null,
    worstDefensiveGame: scoredAppearances.length ? Math.max(...scoredAppearances.map((match) => match.goalsAgainst)) : null,
    gamesBelowTeamAverage: belowAverage,
    gamesBelowTeamAverageRate: belowAverage === null ? null : percentage(belowAverage, scoredAppearances.length),
    goalsAgainstWithoutPlayer,
    collectiveObservedImpact:
      goalsAgainstWithoutPlayer === null || goalsAgainstPerGame === null
        ? null
        : goalsAgainstWithoutPlayer - goalsAgainstPerGame,
    comparisonLabel: "Impact collectif observé",
    coverage: {
      periodMatches: periodMatches.length,
      periodMatchesWithScore: scoredPeriodMatches.length,
      playerAppearances: appearances.length,
      playerAppearancesWithScore: scoredAppearances.length,
      matchesWithoutPlayerWithScore: scoredWithoutPlayer.length,
      status:
        scoredPeriodMatches.length === 0 || scoredAppearances.length === 0
          ? "unavailable"
          : scoredPeriodMatches.length === periodMatches.length && scoredAppearances.length === appearances.length
            ? "complete"
            : "partial",
    },
  };
}

function partnershipComparator(direction, rateKey, countKey) {
  return (left, right) => {
    const rateDifference = direction * (right[rateKey] - left[rateKey]);
    if (rateDifference !== 0) return rateDifference;
    if (right.matchesTogether !== left.matchesTogether) return right.matchesTogether - left.matchesTogether;
    if (right[countKey] !== left[countKey]) return right[countKey] - left[countKey];
    return left.playerName.localeCompare(right.playerName, "fr");
  };
}

export function calculatePlayerPartnerships({
  selectedPlayerId,
  periodMatches,
  playersById,
  minMatchesTogether = DEFAULT_ANALYTICS_CONFIG.MIN_MATCHS_ENSEMBLE,
}) {
  const selectedId = String(selectedPlayerId);
  const pairs = new Map();
  for (const match of periodMatches) {
    if (!match.participants.has(selectedId)) continue;
    const hasKnownOutcome = new Set(["victory", "tie", "defeat"]).has(match.outcome);
    const selected = match.playerDetails[selectedId] ?? { goals: null, assists: null };
    for (const partnerId of match.participants) {
      if (partnerId === selectedId) continue;
      if (!pairs.has(partnerId)) {
        pairs.set(partnerId, {
          playerId: partnerId,
          playerName: playersById.get(partnerId)?.displayName ?? `Joueur SportEasy ${partnerId}`,
          matchesTogether: 0,
          matchesWithKnownOutcome: 0,
          winsTogether: 0,
          drawsTogether: 0,
          lossesTogether: 0,
          goalsValues: [],
          assistsValues: [],
        });
      }
      const pair = pairs.get(partnerId);
      pair.matchesTogether += 1;
      if (hasKnownOutcome) {
        pair.matchesWithKnownOutcome += 1;
        if (match.outcome === "victory") pair.winsTogether += 1;
        else if (match.outcome === "tie") pair.drawsTogether += 1;
        else pair.lossesTogether += 1;
      }
      pair.goalsValues.push(selected.goals);
      pair.assistsValues.push(selected.assists);
    }
  }

  return [...pairs.values()].map((pair) => {
    const offenseComplete = completeValues(pair.goalsValues) && completeValues(pair.assistsValues);
    const goals = offenseComplete ? sum(pair.goalsValues) : null;
    const assists = offenseComplete ? sum(pair.assistsValues) : null;
    const contributions = goals === null || assists === null ? null : goals + assists;
    return {
      playerId: pair.playerId,
      playerName: pair.playerName,
      matchesTogether: pair.matchesTogether,
      matchesWithKnownOutcome: pair.matchesWithKnownOutcome,
      winsTogether: pair.winsTogether,
      drawsTogether: pair.drawsTogether,
      lossesTogether: pair.lossesTogether,
      winRate: pair.matchesWithKnownOutcome === pair.matchesTogether
        ? percentage(pair.winsTogether, pair.matchesTogether)
        : null,
      lossRate: pair.matchesWithKnownOutcome === pair.matchesTogether
        ? percentage(pair.lossesTogether, pair.matchesTogether)
        : null,
      playerGoals: goals,
      playerAssists: assists,
      playerContributions: contributions,
      playerContributionsPerGame: safeDivide(contributions, pair.matchesTogether),
      qualifies: pair.matchesTogether >= minMatchesTogether,
      detailedOffenseComplete: offenseComplete,
      outcomeCoverage: pair.matchesWithKnownOutcome === pair.matchesTogether ? "complete" : "partial",
    };
  });
}

export function calculateAverageMatchesTogether(partnerships) {
  const matchCounts = partnerships
    .map((pair) => pair.matchesTogether)
    .filter((value) => Number.isFinite(value) && value > 0);
  return matchCounts.length > 0 ? safeDivide(sum(matchCounts), matchCounts.length) : null;
}

export function calculateFavoriteLineup(
  partnerships,
  count = 4,
  averageMatchesTogether = calculateAverageMatchesTogether(partnerships),
) {
  if (!Number.isFinite(averageMatchesTogether)) return [];
  const candidates = partnerships.filter((pair) => Number.isFinite(pair.matchesTogether));
  const sortUnknownResults = (left, right) =>
    right.matchesTogether - left.matchesTogether
    || left.playerName.localeCompare(right.playerName, "fr");
  const prioritized = (meetsAverage) => [
    ...candidates
      .filter((pair) => meetsAverage(pair) && Number.isFinite(pair.winRate))
      .sort(partnershipComparator(1, "winRate", "winsTogether")),
    ...candidates
      .filter((pair) => meetsAverage(pair) && !Number.isFinite(pair.winRate))
      .sort(sortUnknownResults),
  ];
  const eligible = prioritized((pair) => pair.matchesTogether >= averageMatchesTogether);
  const fallback = prioritized((pair) => pair.matchesTogether < averageMatchesTogether);
  return [...eligible, ...fallback]
    .slice(0, count)
    .map(({ playerId, playerName, matchesTogether, winsTogether, winRate }) => ({
      playerId,
      playerName,
      matchesTogether,
      winsTogether,
      winRate,
      belowAverageFallback: matchesTogether < averageMatchesTogether,
      missingResultFallback: !Number.isFinite(winRate),
    }));
}

function collectiveAxis({ playerId, periodMatches, playersById }) {
  const partnerships = calculatePlayerPartnerships({
    selectedPlayerId: playerId,
    periodMatches,
    playersById,
    minMatchesTogether: 1,
  });
  const averageMatchesTogether = calculateAverageMatchesTogether(partnerships);
  const minimumMatchesTogether = Number.isFinite(averageMatchesTogether)
    ? Math.ceil(averageMatchesTogether)
    : null;
  const significant = partnerships.filter((pair) =>
    Number.isFinite(averageMatchesTogether)
    && pair.matchesTogether >= averageMatchesTogether,
  );
  const byWin = [...significant].filter((pair) => Number.isFinite(pair.winRate));
  const byLoss = [...significant].filter((pair) => Number.isFinite(pair.lossRate));
  const byOffense = [...significant].filter((pair) => Number.isFinite(pair.playerContributionsPerGame));
  const favoriteLineupCandidateCount = partnerships.length;
  const favoriteLineup = calculateFavoriteLineup(partnerships, 4, averageMatchesTogether);
  return {
    bestWinningPartner: byWin.sort(partnershipComparator(1, "winRate", "winsTogether"))[0] ?? null,
    worstLosingPartner: byLoss.sort(partnershipComparator(1, "lossRate", "lossesTogether"))[0] ?? null,
    bestOffensivePartner: byOffense.sort(partnershipComparator(1, "playerContributionsPerGame", "playerContributions"))[0] ?? null,
    worstOffensivePartner: byOffense.sort(partnershipComparator(-1, "playerContributionsPerGame", "playerContributions"))[0] ?? null,
    favoriteLineup,
    favoriteLineupCandidateCount,
    favoriteLineupComplete: favoriteLineup.length === 4,
    favoriteLineupFallbackCount: favoriteLineup.filter((pair) => pair.belowAverageFallback).length,
    averageMatchesTogether,
    favoriteLineupAverageMatches: averageMatchesTogether,
    favoriteLineupMinimumMatches: minimumMatchesTogether,
    partnerships,
    minimumMatchesTogether,
    sampleRule: "average-matches-together",
  };
}

function validationForPlayer({ primary, creation, finishing, offensive, collective, appearances }) {
  const issues = [];
  const error = (code, details) => issues.push({ severity: "error", code, details });
  if (primary.goals !== null && primary.matches !== null && finishing.goalsPerGame !== safeDivide(primary.goals, primary.matches)) {
    error("goals-per-game-mismatch", { goals: primary.goals, matches: primary.matches, value: finishing.goalsPerGame });
  }
  if (primary.assists !== null && primary.matches !== null && creation.assistsPerGame !== safeDivide(primary.assists, primary.matches)) {
    error("assists-per-game-mismatch", { assists: primary.assists, matches: primary.matches, value: creation.assistsPerGame });
  }
  if (offensive.contributions !== null && primary.goals !== null && primary.assists !== null && offensive.contributions !== primary.goals + primary.assists) {
    error("contributions-mismatch", { contributions: offensive.contributions, goals: primary.goals, assists: primary.assists });
  }
  for (const [key, value] of Object.entries({ scoring: finishing.scoringGameRate, assist: creation.assistGameRate, decisive: offensive.decisiveGameRate })) {
    if (value !== null && (value < 0 || value > 100)) error("rate-out-of-range", { key, value });
  }
  const detailedResultTotal = primary.detailedResults.wins
    + primary.detailedResults.draws
    + primary.detailedResults.losses;
  if (detailedResultTotal !== primary.detailedResults.matchesWithKnownOutcome) {
    error("player-outcome-mismatch", {
      resultTotal: detailedResultTotal,
      matchesWithKnownOutcome: primary.detailedResults.matchesWithKnownOutcome,
    });
  }
  for (const pair of collective.partnerships) {
    if (pair.winsTogether + pair.drawsTogether + pair.lossesTogether !== pair.matchesWithKnownOutcome) {
      error("partnership-outcome-mismatch", { playerId: pair.playerId });
    }
    if (pair.matchesTogether > appearances.length) {
      error("partnership-match-overflow", { playerId: pair.playerId, matchesTogether: pair.matchesTogether });
    }
  }
  if (collective.favoriteLineup.length > 4) {
    error("favorite-lineup-overflow", { count: collective.favoriteLineup.length });
  }
  const expectedFavoriteLineupCount = Math.min(4, collective.favoriteLineupCandidateCount);
  if (collective.favoriteLineup.length !== expectedFavoriteLineupCount) {
    error("favorite-lineup-incomplete", {
      count: collective.favoriteLineup.length,
      expectedCount: expectedFavoriteLineupCount,
      candidateCount: collective.favoriteLineupCandidateCount,
    });
  }
  if (collective.favoriteLineupCandidateCount >= 4 && !collective.favoriteLineupComplete) {
    error("favorite-lineup-missing-fourth-player", {
      count: collective.favoriteLineup.length,
      candidateCount: collective.favoriteLineupCandidateCount,
    });
  }
  for (const key of [
    "bestWinningPartner",
    "worstLosingPartner",
    "bestOffensivePartner",
    "worstOffensivePartner",
  ]) {
    const pair = collective[key];
    if (pair && (!Number.isFinite(collective.averageMatchesTogether)
      || pair.matchesTogether < collective.averageMatchesTogether)) {
      error("collective-relation-below-average", {
        key,
        playerId: pair.playerId,
        matchesTogether: pair.matchesTogether,
        averageMatchesTogether: collective.averageMatchesTogether,
      });
    }
  }
  const detailedGoals = appearances.map((appearance) => appearance.goals);
  const detailedAssists = appearances.map((appearance) => appearance.assists);
  if (completeValues(detailedGoals) && primary.goals !== null && sum(detailedGoals) !== primary.goals) {
    error("official-vs-detailed-goals", { official: primary.goals, detailed: sum(detailedGoals) });
  }
  if (completeValues(detailedAssists) && primary.assists !== null && sum(detailedAssists) !== primary.assists) {
    error("official-vs-detailed-assists", { official: primary.assists, detailed: sum(detailedAssists) });
  }
  if (primary.matches !== null && primary.matches !== appearances.length) {
    error("official-vs-detailed-appearances", { official: primary.matches, detailed: appearances.length });
  }
  return issues;
}

function buildPlayerPeriod({ player, period, periodMatches, playersById, config, recoveredEventIds = new Set() }) {
  const playerId = String(player.sporteasyId);
  const appearances = periodMatches
    .filter((match) => match.participants.has(playerId))
    .map((match) => ({
      eventId: match.eventId,
      date: match.date,
      outcome: match.outcome,
      goalsFor: match.goalsFor,
      goalsAgainst: match.goalsAgainst,
      teamAssists: match.teamAssists,
      goals: match.playerDetails[playerId]?.goals ?? null,
      assists: match.playerDetails[playerId]?.assists ?? null,
      goalsSource: match.playerDetails[playerId]?.goalsSource ?? null,
      assistsSource: match.playerDetails[playerId]?.assistsSource ?? null,
      grade: match.playerDetails[playerId]?.grade ?? null,
      manOfMatch: match.playerDetails[playerId]?.manOfMatch ?? 0,
    }))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const primary = primaryForPlayer(period, playerId, appearances, recoveredEventIds);
  const goalsValues = appearances.map((appearance) => appearance.goals);
  const assistsValues = appearances.map((appearance) => appearance.assists);
  const teamGoalValues = appearances.map((appearance) => appearance.goalsFor);
  const teamAssistValues = appearances.map((appearance) => appearance.teamAssists);
  const finishingBase = axisFromValues({
    total: primary.goals,
    matches: primary.matches,
    values: goalsValues,
    teamTotals: teamGoalValues,
    recentCount: config.RECENT_APPEARANCES,
  });
  const creationBase = axisFromValues({
    total: primary.assists,
    matches: primary.matches,
    values: assistsValues,
    teamTotals: teamAssistValues,
    recentCount: config.RECENT_APPEARANCES,
  });
  const contributionValues = goalsValues.map((goals, index) =>
    Number.isFinite(goals) && Number.isFinite(assistsValues[index]) ? goals + assistsValues[index] : null,
  );
  const contributions = primary.goals === null || primary.assists === null ? null : primary.goals + primary.assists;
  const offensiveBase = axisFromValues({
    total: contributions,
    matches: primary.matches,
    values: contributionValues,
    teamTotals: teamGoalValues,
    recentCount: config.RECENT_APPEARANCES,
  });
  const creation = {
    assists: creationBase.total,
    assistsPerGame: creationBase.perGame,
    gamesWithAssist: creationBase.gamesWithValue,
    assistGameRate: creationBase.gameRate,
    maxAssistsInGame: creationBase.maxInGame,
    assistStreak: creationBase.longestStreak,
    last5Assists: creationBase.last5Total,
    teamAssistShare: creationBase.teamShare,
  };
  const finishing = {
    goals: finishingBase.total,
    goalsPerGame: finishingBase.perGame,
    gamesWithGoal: finishingBase.gamesWithValue,
    scoringGameRate: finishingBase.gameRate,
    maxGoalsInGame: finishingBase.maxInGame,
    scoringStreak: finishingBase.longestStreak,
    last5Goals: finishingBase.last5Total,
    teamGoalShare: finishingBase.teamShare,
  };
  const offensive = {
    contributions,
    contributionsPerGame: offensiveBase.perGame,
    decisiveGames: offensiveBase.gamesWithValue,
    decisiveGameRate: offensiveBase.gameRate,
    maxContributionsInGame: offensiveBase.maxInGame,
    decisiveStreak: offensiveBase.longestStreak,
    last5Contributions: offensiveBase.last5Total,
    offensiveContributionIndex: offensiveBase.teamShare,
    contributionLabel: "Part dans la production offensive",
  };
  const defensive = defensiveAxis(periodMatches, appearances);
  const collective = collectiveAxis({
    playerId,
    periodMatches,
    playersById,
  });
  const issues = validationForPlayer({ primary, creation, finishing, offensive, collective, appearances });

  return {
    player: {
      sporteasyId: playerId,
      status: player.isCurrent ? "current" : "former",
    },
    primary,
    creation,
    finishing,
    offensive,
    defensive,
    collective,
    rankings: {},
    trace: {
      primarySource: "SportEasy stats/all/players + verified played cancelled matches",
      detailedSource: "SportEasy event statistics + attendance + verified played cancelled matches",
      appearanceEventIds: appearances.map((appearance) => appearance.eventId),
      detailedAppearanceCount: appearances.length,
      goalsDetailComplete: finishingBase.detailedComplete,
      assistsDetailComplete: creationBase.detailedComplete,
      contributionDetailComplete: offensiveBase.detailedComplete,
      teamGoalShareCoverage: finishingBase.teamShareCoverage,
      teamAssistShareCoverage: creationBase.teamShareCoverage,
      normalizedOmittedZeros: {
        goals: appearances.filter((appearance) => appearance.goalsSource === "sporteasy-omitted-zero").length,
        assists: appearances.filter((appearance) => appearance.assistsSource === "sporteasy-omitted-zero").length,
      },
      recentAppearanceCount: Math.min(config.RECENT_APPEARANCES, appearances.length),
      issues,
    },
  };
}

function assignRanking(playerPeriods, key, valueOf, eligible) {
  const candidates = playerPeriods
    .filter(({ analytics }) => eligible(analytics) && Number.isFinite(valueOf(analytics)))
    .sort((left, right) => valueOf(right.analytics) - valueOf(left.analytics) || left.playerName.localeCompare(right.playerName, "fr"));
  let previousValue = null;
  let previousRank = 0;
  candidates.forEach((candidate, index) => {
    const value = valueOf(candidate.analytics);
    const rank = previousValue === value ? previousRank : index + 1;
    candidate.analytics.rankings[key] = { rank, eligiblePlayers: candidates.length, value };
    previousValue = value;
    previousRank = rank;
  });
  for (const candidate of playerPeriods) {
    if (!candidate.analytics.rankings[key]) candidate.analytics.rankings[key] = null;
  }
}

function addRankings(playerPeriods, config) {
  const all = () => true;
  const rateEligible = (analytics) =>
    Number.isFinite(analytics.primary.matches) && analytics.primary.matches >= config.MIN_MATCHES_FOR_RATE_RANKING;
  assignRanking(playerPeriods, "goals", (analytics) => analytics.primary.goals, all);
  assignRanking(playerPeriods, "assists", (analytics) => analytics.primary.assists, all);
  assignRanking(playerPeriods, "contributions", (analytics) => analytics.offensive.contributions, all);
  assignRanking(playerPeriods, "goalsPerGame", (analytics) => analytics.finishing.goalsPerGame, rateEligible);
  assignRanking(playerPeriods, "assistsPerGame", (analytics) => analytics.creation.assistsPerGame, rateEligible);
  assignRanking(playerPeriods, "contributionsPerGame", (analytics) => analytics.offensive.contributionsPerGame, rateEligible);
  assignRanking(playerPeriods, "averageRating", (analytics) => analytics.primary.averageRating, rateEligible);
  for (const { analytics } of playerPeriods) analytics.rankings.performanceIndex = null;
}

export function buildPlayerSecondaryRepository({
  matchRepository,
  statisticsRepository,
  playersRepository,
  playerEssentialsRepository = { players: [] },
  verifiedPlayedCancelledMatches = { matches: [], excludedCalendarAwardYears: [] },
  officialPlayerAwards = { awards: [] },
  config: suppliedConfig = {},
  generatedAt = new Date().toISOString(),
}) {
  const config = { ...DEFAULT_ANALYTICS_CONFIG, ...suppliedConfig };
  const players = playersRepository?.players ?? [];
  const playersById = new Map(players.map((player) => [String(player.sporteasyId), player]));
  const positionsById = new Map(
    (playerEssentialsRepository?.players ?? []).map((player) => [String(player.sporteasyId), player.position]),
  );
  const recoveredMatchesByEvent = new Map(
    (verifiedPlayedCancelledMatches?.matches ?? []).map((correction) => [String(correction.eventId), correction]),
  );
  const normalizedMatches = (matchRepository?.matches ?? [])
    .filter((match) => match.status?.isPast && (!match.status?.isCancelled || recoveredMatchesByEvent.has(String(match.eventId))))
    .map((match) => {
      const recovered = recoveredMatchesByEvent.get(String(match.eventId));
      return normalizeMatch(recovered ? { ...match, playerStatistics: recovered.playerStatistics } : match);
    })
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const calendarYearAwards = buildOfficialPlayerAwards({
    officialPlayerAwards,
    playersById,
  });
  calendarYearAwards.recoveredCancelledMatchCount = recoveredMatchesByEvent.size;
  const careerMatchesByPlayer = new Map(players.map((player) => [String(player.sporteasyId), 0]));
  for (const match of normalizedMatches) {
    for (const playerId of match.participants) {
      careerMatchesByPlayer.set(playerId, (careerMatchesByPlayer.get(playerId) ?? 0) + 1);
    }
  }
  const primeByPlayer = calculatePlayerPrimes({ matches: normalizedMatches, players, positionsById, careerMatchesByPlayer });
  const periods = {};
  const orderedSeasonIds = (statisticsRepository?.periods?.allTime?.seasonIds ?? []).map(String);

  for (const periodKey of ["current", "previous", "allTime"]) {
    const primaryPeriod = statisticsRepository?.periods?.[periodKey];
    const seasonIds = (primaryPeriod?.seasonIds ?? []).map(String);
    const seasonSet = new Set(seasonIds);
    const lastPeriodSeasonIndex = Math.max(-1, ...seasonIds.map((seasonId) => orderedSeasonIds.indexOf(seasonId)));
    const seasonsKnownByPeriod = new Set(orderedSeasonIds.slice(0, lastPeriodSeasonIndex + 1));
    const tenureSeasonsByPlayer = new Map(players.map((player) => [
      String(player.sporteasyId),
      new Set((player.seasonIds ?? []).map(String).filter((seasonId) => seasonsKnownByPeriod.has(seasonId))).size,
    ]));
    const periodMatches = normalizedMatches.filter((match) => seasonSet.has(match.seasonId));
    const playerPeriods = players.map((player) => ({
      playerId: String(player.sporteasyId),
      playerName: player.displayName,
      analytics: buildPlayerPeriod({
        player,
        period: primaryPeriod,
        periodMatches,
        playersById,
        config,
        recoveredEventIds: new Set(
          periodMatches.filter((match) => recoveredMatchesByEvent.has(match.eventId)).map((match) => match.eventId),
        ),
      }),
    }));
    addRankings(playerPeriods, config);
    const performanceRatings = calculatePeriodPerformanceRatings({
      periodKey,
      periodMatches,
      players,
      positionsById,
      careerMatchesByPlayer,
      averageRatingsByPlayer: new Map(players.map((player) => [
        String(player.sporteasyId),
        metricValue(primaryPeriod, String(player.sporteasyId), "gradeAverage"),
      ])),
      manOfTheMatchByPlayer: new Map(players.map((player) => {
        const playerId = String(player.sporteasyId);
        return [playerId, {
          total: metricValue(primaryPeriod, playerId, "manOfMatch"),
          matches: metricValue(primaryPeriod, playerId, "matchesPlayed"),
        }];
      })),
      tenureSeasonsByPlayer,
      awardsByPlayer: new Map(Object.entries(calendarYearAwards.byPlayer).map(([playerId, awards]) => [
        playerId,
        awards.filter((award) => periodMatches.some((match) => Number(String(match.date).slice(0, 4)) === award.year)),
      ])),
    });
    for (const playerPeriod of playerPeriods) {
      const score = performanceRatings.players[playerPeriod.playerId];
      playerPeriod.analytics.performance = score.performance;
      playerPeriod.analytics.performanceTrace = score.trace;
    }
    const rawIssues = playerPeriods.flatMap(({ playerId, analytics }) =>
      analytics.trace.issues.map((issue) => ({ playerId, ...issue })),
    );
    const issues = [...rawIssues, ...performanceRatings.validation.issues];
    periods[periodKey] = {
      seasonIds,
      matchCount: periodMatches.length,
      matchesWithCompleteScore: periodMatches.filter(
        (match) => Number.isFinite(match.goalsFor) && Number.isFinite(match.goalsAgainst),
      ).length,
      players: Object.fromEntries(playerPeriods.map(({ playerId, analytics }) => [playerId, analytics])),
      validation: {
        status: issues.some((issue) => issue.severity === "error") ? "invalid" : "valid",
        errorCount: issues.filter((issue) => issue.severity === "error").length,
        warningCount: issues.filter((issue) => issue.severity === "warning").length,
        issues,
      },
      performanceValidation: performanceRatings.validation,
    };
  }

  const errorCount = Object.values(periods).reduce((total, period) => total + period.validation.errorCount, 0);
  const warningCount = Object.values(periods).reduce((total, period) => total + period.validation.warningCount, 0);
  return {
    metadata: {
      ratingSystem: "Metron",
      sourceOfTruth: "SportEasy primary data",
      generatedAt,
      formulaVersion: SCORING_CONFIG.VERSION,
      validationStatus: errorCount === 0 ? "valid" : "invalid",
      errorCount,
      warningCount,
      config,
      exclusions: [
        "xG", "xA", "shots", "shotsOnTarget", "possession", "interceptions", "tackles",
        "duels", "completedPasses", "distance", "speed", "heatmaps", "pressing", "arbitraryScoresOutOf100",
      ],
      formulas: {
        rate: "numerator / matches",
        percentage: "numerator / matches * 100",
        contributions: "goals + assists",
        defensiveImpact: "goalsAgainstPerGameWithoutPlayer - goalsAgainstPerGameWithPlayer",
        recentForm: "last N player appearances, not last N team matches",
        omittedPlayerGoalOrAssist: "0 when participation is confirmed; reconciled against official SportEasy totals",
        performanceRating: "soft competition weighting (friendly 1, competition 1.25, ProTour 1.5) -> global percentile -> 1..99 rating -> sample confidence",
        manOfTheMatchRating: "35% official total + 65% official rate per match -> standout bonus from 0 to +3",
        tenureBonus: "+0.5 per additional known SportEasy season, capped at +3 overall points",
        positionWeighting: "Metron uses only the latest position recorded in SportEasy: goalkeeper 10/0/75 + 15 grade; defender 30/15/40 + 15 grade; midfielder or missing 40/22.5/22.5 + 15 grade; attacker 25/40/20 + 15 grade; no hybrid profile",
        overallRating: "Metron role weights total 85% across creation + finishing + defensive ratings, plus 15% SportEasy average match rating when available; offensive excluded to prevent double counting",
        overallWithoutPosition: "missing position uses midfielder weights: creation 40%, finishing 22.5%, defensive 22.5%, plus 15% grade; available from 10 matches in the selected period",
        calendarYearAwards: "official club awards for 2023 through 2025; no award for 2022 or earlier",
        awardBonus: "top scorer +2, top assist provider +2, player of the year +4; cumulative bonus uncapped and final rating capped at 99",
        collectiveEligibility: "all collective relationships use teammates whose matches together are at least the player's average matches together per teammate",
        favoriteLineupCompletion: "average-eligible partners first; if fewer than four qualify, fill remaining slots with the best win rates among the other recorded partners",
        playerPrime: "best calendar month by general rating, with at least 4 appearances in that month",
      },
    },
    calendarYearAwards,
    primeByPlayer,
    periods,
  };
}
