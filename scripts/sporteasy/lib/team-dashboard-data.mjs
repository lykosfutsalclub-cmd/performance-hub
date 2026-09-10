function nullableNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeStreak(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  return {
    count: events.length,
    startAt: events[0]?.metadata?.date ?? null,
    endAt: events.at(-1)?.metadata?.date ?? null,
  };
}

function normalizeMatchLabel(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ");
}

function matchOutcome(match) {
  if (match.score.team > match.score.opponent) return "victory";
  if (match.score.team < match.score.opponent) return "defeat";
  return "tie";
}

function longestStreak(matches, accepts) {
  let best = [];
  let current = [];
  matches.forEach((match) => {
    if (accepts(matchOutcome(match))) {
      current.push(match);
      if (current.length > best.length) best = [...current];
    } else {
      current = [];
    }
  });
  if (best.length === 0) return null;
  return { count: best.length, startAt: best[0].date, endAt: best.at(-1).date };
}

export function sanitizeTeamMatches(matches = []) {
  const seenMatches = new Set();
  return matches
    .filter((match) => {
      const eventId = String(match?.eventId ?? "");
      const opponent = match?.opponent?.name ?? match?.opponent?.shortName ?? "";
      const hasValidScore = Number.isFinite(match?.score?.team) && Number.isFinite(match?.score?.opponent);
      if (!eventId || !hasValidScore || /^tournoi\b/i.test(String(opponent).trim())) return false;

      // SportEasy peut enregistrer plusieurs IDs pour la même rencontre. La date,
      // l'adversaire et le score identiques forment alors notre empreinte anti-doublon.
      const day = match.day ?? String(match.startAt ?? "").slice(0, 10);
      const fingerprint = [day, normalizeMatchLabel(opponent), match.score.team, match.score.opponent].join("|");
      if (seenMatches.has(fingerprint)) return false;
      seenMatches.add(fingerprint);
      return true;
    });
}

export function buildTeamDashboardPeriod(chartsData = {}, matches = null) {
  const outcomes = chartsData.outcomes ?? {};
  const scores = chartsData.scores ?? {};
  const averages = chartsData.scores_avg ?? {};
  const streaks = chartsData.streaks ?? {};
  const matchesPlayed = nullableNumber(chartsData.num_played_events);
  const wins = nullableNumber(outcomes.match_outcome_victory_sum);
  const goalsFor = nullableNumber(scores.score_for_sum);
  const goalsAgainst = nullableNumber(scores.score_against_sum);
  const goalsForPerMatch = nullableNumber(averages.score_for_reduce_avg);
  const goalsAgainstPerMatch = nullableNumber(averages.score_against_reduce_avg);
  const recentResults = Array.isArray(chartsData.history)
    ? chartsData.history.slice(0, 10).map((entry) => entry?.outcome).filter((outcome) =>
        ["victory", "tie", "defeat"].includes(outcome),
      )
    : [];
  const hasMatchSource = Array.isArray(matches);
  const cleanMatches = hasMatchSource ? sanitizeTeamMatches(matches) : [];
  const chronologicalMatches = cleanMatches
    .map((match) => ({
      eventId: String(match.eventId),
      date: match.day ?? match.startAt ?? null,
      startAt: match.startAt ?? match.day ?? null,
      opponent: match.opponent?.name ?? match.opponent?.shortName ?? "Adversaire non renseigné",
      score: match.score,
    }))
    .sort((left, right) => String(left.startAt ?? "").localeCompare(String(right.startAt ?? "")));
  const matchDetails = chronologicalMatches
    .map((match) => ({
      eventId: String(match.eventId),
      date: match.date,
      opponent: match.opponent,
      scoreFor: match.score.team,
      scoreAgainst: match.score.opponent,
      difference: match.score.team - match.score.opponent,
    }))
    .sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")));
  const derivedOutcomes = chronologicalMatches.map(matchOutcome);
  const sourceMatchesPlayed = hasMatchSource ? matchDetails.length : matchesPlayed;
  const sourceWins = hasMatchSource ? derivedOutcomes.filter((outcome) => outcome === "victory").length : wins;
  const sourceDraws = hasMatchSource ? derivedOutcomes.filter((outcome) => outcome === "tie").length : nullableNumber(outcomes.match_outcome_tie_sum);
  const sourceLosses = hasMatchSource ? derivedOutcomes.filter((outcome) => outcome === "defeat").length : nullableNumber(outcomes.match_outcome_defeat_sum);
  const sourceGoalsFor = hasMatchSource ? matchDetails.reduce((total, match) => total + match.scoreFor, 0) : goalsFor;
  const sourceGoalsAgainst = hasMatchSource ? matchDetails.reduce((total, match) => total + match.scoreAgainst, 0) : goalsAgainst;
  const sourceGoalsForPerMatch = hasMatchSource && sourceMatchesPlayed > 0 ? sourceGoalsFor / sourceMatchesPlayed : goalsForPerMatch;
  const sourceGoalsAgainstPerMatch = hasMatchSource && sourceMatchesPlayed > 0 ? sourceGoalsAgainst / sourceMatchesPlayed : goalsAgainstPerMatch;
  const sourceRecentResults = hasMatchSource ? derivedOutcomes.slice(-10).reverse() : recentResults;
  const sourceRecentPoints = sourceRecentResults.reduce((total, outcome) =>
    total + (outcome === "victory" ? 3 : outcome === "tie" ? 1 : 0), 0);
  const differences = matchDetails.map((match) => match.difference);
  const minDifference = differences.length ? Math.min(...differences) : 0;
  const maxDifference = differences.length ? Math.max(...differences) : -1;
  const derivedDistribution = Array.from({ length: maxDifference - minDifference + 1 }, (_, index) => {
    const difference = minDifference + index;
    const fixtures = matchDetails.filter((match) => match.difference === difference);
    return { difference, matches: fixtures.length, fixtures };
  });

  return {
    matchesPlayed: sourceMatchesPlayed,
    wins: sourceWins,
    draws: sourceDraws,
    losses: sourceLosses,
    goalsFor: sourceGoalsFor,
    goalsAgainst: sourceGoalsAgainst,
    goalsForPerMatch: sourceMatchesPlayed > 0 ? round(sourceGoalsForPerMatch, 2) : null,
    goalsAgainstPerMatch: sourceMatchesPlayed > 0 ? round(sourceGoalsAgainstPerMatch, 2) : null,
    winRate: sourceMatchesPlayed > 0 && sourceWins !== null ? round((sourceWins / sourceMatchesPlayed) * 100) : null,
    goalDifference: sourceMatchesPlayed > 0 && sourceGoalsFor !== null && sourceGoalsAgainst !== null ? sourceGoalsFor - sourceGoalsAgainst : null,
    averageGoalDifference: sourceMatchesPlayed > 0 && sourceGoalsForPerMatch !== null && sourceGoalsAgainstPerMatch !== null
      ? round(sourceGoalsForPerMatch - sourceGoalsAgainstPerMatch, 2)
      : null,
    recentFormScore: sourceRecentResults.length > 0 ? round((sourceRecentPoints / (sourceRecentResults.length * 3)) * 100) : null,
    scoreDistribution: hasMatchSource ? derivedDistribution : Array.isArray(chartsData.scores_distribution)
      ? chartsData.scores_distribution.map((entry) => {
          const difference = nullableNumber(entry?.slug_name);
          return {
            difference,
            matches: nullableNumber(entry?.value),
            fixtures: difference === null ? [] : matchDetails.filter((match) => match.difference === difference),
          };
        }).filter((entry) => entry.difference !== null && entry.matches !== null)
      : [],
    recentResults: sourceRecentResults,
    streaks: hasMatchSource ? {
      wins: longestStreak(chronologicalMatches, (outcome) => outcome === "victory"),
      unbeaten: longestStreak(chronologicalMatches, (outcome) => outcome !== "defeat"),
      losses: longestStreak(chronologicalMatches, (outcome) => outcome === "defeat"),
      winless: longestStreak(chronologicalMatches, (outcome) => outcome !== "victory"),
    } : {
      wins: normalizeStreak(streaks.streak_match_outcome_victory),
      unbeaten: normalizeStreak(streaks.streak_match_outcome_tie_victory),
      losses: normalizeStreak(streaks.streak_match_outcome_defeat),
      winless: normalizeStreak(streaks.streak_match_outcome_defeat_tie),
    },
  };
}

export function validateTeamDashboardPeriod(period, label = "période") {
  if (period.matchesPlayed === null) throw new Error(`${label}: nombre de matchs absent.`);
  if (period.matchesPlayed === 0) return true;

  const outcomes = [period.wins, period.draws, period.losses];
  if (!outcomes.every(Number.isFinite)) throw new Error(`${label}: bilan victoires/nuls/défaites incomplet.`);
  if (outcomes.reduce((total, value) => total + value, 0) !== period.matchesPlayed) {
    throw new Error(`${label}: le bilan ne correspond pas au nombre de matchs.`);
  }

  const distributedMatches = period.scoreDistribution.reduce((total, entry) => total + entry.matches, 0);
  if (distributedMatches !== period.matchesPlayed) {
    throw new Error(`${label}: la répartition des écarts ne correspond pas au nombre de matchs.`);
  }
  const detailedMatches = period.scoreDistribution.reduce((total, entry) => total + (entry.fixtures?.length ?? 0), 0);
  if (detailedMatches > 0 && detailedMatches !== period.matchesPlayed) {
    throw new Error(`${label}: le détail des matchs ne correspond pas au nombre de matchs.`);
  }
  return true;
}
