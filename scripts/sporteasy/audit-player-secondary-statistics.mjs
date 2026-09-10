import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { safeDivide } from "../../src/statistics/player-secondary-analytics.mjs";
import { SCORING_CONFIG } from "../../src/performance/scoring-config.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const reportFile = fileURLToPath(new URL("player-secondary-audit-report.json", privateRoot));
const PERIOD_KEYS = ["current", "previous", "allTime"];
const SAMPLE_PLAYER_IDS = ["3687283", "3687303", "7649102", "5767725", "8623360"];

async function readPrivate(name) {
  return JSON.parse(await readFile(fileURLToPath(new URL(name, privateRoot)), "utf8"));
}

function rawMetric(period, playerId, key) {
  const metric = period?.players?.[playerId]?.metrics?.[key];
  return metric?.status === "available" ? metric.value : null;
}

function sameNumber(left, right) {
  if (left === null || right === null) return left === right;
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < Number.EPSILON * 32;
}

try {
  const [secondary, statistics, matches, players, verifiedPlayedCancelledMatches] = await Promise.all([
    readPrivate("player-secondary-statistics.json"),
    readPrivate("statistics-repository.json"),
    readPrivate("match-repository.json"),
    readPrivate("players-repository.json"),
    readPrivate("verified-played-cancelled-matches.json"),
  ]);
  const checks = [];
  const addCheck = (id, label, passed, details) => checks.push({
    id,
    label,
    status: passed ? "passed" : "failed",
    details,
  });

  addCheck(
    "repository-validation",
    "Le moteur n'a publié aucune incohérence bloquante",
    secondary.metadata.validationStatus === "valid" && secondary.metadata.errorCount === 0,
    { status: secondary.metadata.validationStatus, errors: secondary.metadata.errorCount },
  );
  addCheck(
    "period-set",
    "Les trois filtres temporels sont calculés séparément",
    PERIOD_KEYS.every((key) => secondary.periods[key]),
    { expected: PERIOD_KEYS, actual: Object.keys(secondary.periods) },
  );
  for (const periodKey of PERIOD_KEYS) {
    const secondaryPeriod = secondary.periods[periodKey];
    const primaryPeriod = statistics.periods[periodKey];
    const secondaryIds = Object.keys(secondaryPeriod.players);
    const seasonIds = new Set((primaryPeriod.seasonIds ?? []).map(String));
    const matchSeasonById = new Map(matches.matches.map((match) => [String(match.eventId), String(match.seasonId)]));
    const recoveredForPeriod = (verifiedPlayedCancelledMatches.matches ?? []).filter(
      (match) => seasonIds.has(matchSeasonById.get(String(match.eventId))),
    );
    addCheck(
      `players-${periodKey}`,
      `${periodKey} contient tous les joueurs du référentiel`,
      secondaryIds.length === players.players.length,
      { expected: players.players.length, actual: secondaryIds.length },
    );

    const formulaFailures = [];
    for (const [playerId, analytics] of Object.entries(secondaryPeriod.players)) {
      const recoveredRows = recoveredForPeriod.flatMap((match) =>
        (match.playerStatistics ?? []).filter((row) => String(row.profileId) === playerId),
      );
      const supplement = {
        matches: recoveredRows.length,
        goals: recoveredRows.reduce((total, row) => total + (Number(row.metrics?.player_goals) || 0), 0),
        assists: recoveredRows.reduce((total, row) => total + (Number(row.metrics?.player_assists) || 0), 0),
      };
      const recoveredExpected = (key, addition) => {
        const official = rawMetric(primaryPeriod, playerId, key);
        return official === null ? null : official + addition;
      };
      const expected = {
        matches: recoveredExpected("matchesPlayed", supplement.matches),
        goals: recoveredExpected("goals", supplement.goals),
        assists: recoveredExpected("assists", supplement.assists),
      };
      const actual = analytics.primary;
      const ratings = [
        analytics.performance.creation,
        analytics.performance.finishing,
        analytics.performance.offensive,
        analytics.performance.defensive,
        analytics.performance.overall,
      ].filter((value) => value !== null);
      const usedOverallBlocks = analytics.performanceTrace?.overall?.usedBlocks?.map((entry) => entry.rating) ?? [];
      const overallTrace = analytics.performanceTrace?.overall ?? {};
      const resultTotal = actual.detailedResults.wins + actual.detailedResults.draws + actual.detailedResults.losses;
      const invariants = {
        primaryMatches: sameNumber(actual.matches, expected.matches),
        primaryGoals: sameNumber(actual.goals, expected.goals),
        primaryAssists: sameNumber(actual.assists, expected.assists),
        goalsPerGame: sameNumber(analytics.finishing.goalsPerGame, safeDivide(actual.goals, actual.matches)),
        assistsPerGame: sameNumber(analytics.creation.assistsPerGame, safeDivide(actual.assists, actual.matches)),
        contributions: sameNumber(
          analytics.offensive.contributions,
          actual.goals === null || actual.assists === null ? null : actual.goals + actual.assists,
        ),
        contributionsPerGame: sameNumber(
          analytics.offensive.contributionsPerGame,
          safeDivide(analytics.offensive.contributions, actual.matches),
        ),
        results: resultTotal === actual.detailedResults.matchesWithKnownOutcome,
        rates: [
          analytics.finishing.scoringGameRate,
          analytics.creation.assistGameRate,
          analytics.offensive.decisiveGameRate,
        ].every((value) => value === null || (value >= 0 && value <= 100)),
        partnerships: analytics.collective.partnerships.every((pair) =>
          pair.matchesTogether <= actual.detailedAppearanceCount
          && pair.winsTogether + pair.drawsTogether + pair.lossesTogether === pair.matchesWithKnownOutcome
          && pair.winsTogether <= pair.matchesTogether,
        ),
        favoriteLineup:
          analytics.collective.favoriteLineup.length <= 4
          && analytics.collective.favoriteLineup.length
            === Math.min(4, analytics.collective.favoriteLineupCandidateCount)
          && (analytics.collective.favoriteLineupCandidateCount < 4
            || analytics.collective.favoriteLineupComplete),
        collectiveRelations: [
          analytics.collective.bestWinningPartner,
          analytics.collective.worstLosingPartner,
          analytics.collective.bestOffensivePartner,
          analytics.collective.worstOffensivePartner,
        ].every((pair) => pair === null || (
          Number.isFinite(analytics.collective.averageMatchesTogether)
          && pair.matchesTogether >= analytics.collective.averageMatchesTogether
        )),
        allAppearancesUsedForScoring:
          analytics.performanceTrace?.scoringMatches === undefined
          || analytics.performanceTrace.scoringMatches === actual.detailedAppearanceCount,
        ratingBounds: ratings.every((value) => Number.isInteger(value) && value >= 1 && value <= 99),
        baseOverallWithinBlocks:
          overallTrace.baseRating === null
          || usedOverallBlocks.length === 0
          || (
            overallTrace.baseRating >= Math.min(...usedOverallBlocks)
            && overallTrace.baseRating <= Math.max(...usedOverallBlocks)
          ),
        awardBonusValid:
          Number.isInteger(analytics.performance.awardBonus)
          && analytics.performance.awardBonus >= 0,
        tenureBonusValid:
          Number.isFinite(analytics.performance.tenureBonus)
          && analytics.performance.tenureBonus >= 0
          && analytics.performance.tenureBonus <= 3,
        manOfTheMatchBonusValid:
          Number.isFinite(analytics.performance.manOfTheMatchBonus)
          && analytics.performance.manOfTheMatchBonus >= 0
          && analytics.performance.manOfTheMatchBonus <= 3,
        overallIncludesMetronBonuses:
          analytics.performance.overall === null
            ? overallTrace.baseRating === null
              && analytics.performance.awardBonus === 0
              && analytics.performance.tenureBonus === 0
              && analytics.performance.manOfTheMatchBonus === 0
            : analytics.performance.overall === Math.min(
              99,
              Math.max(1, Math.round(
                overallTrace.baseRating
                + analytics.performance.awardBonus
                + analytics.performance.tenureBonus
                + analytics.performance.manOfTheMatchBonus
              )),
            ),
        teamGoalShareAvailable:
          !Number.isFinite(actual.matches)
          || actual.matches === 0
          || analytics.finishing.teamGoalShare !== null,
        overallEligibility:
          !Number.isFinite(actual.matches)
          || actual.matches < (periodKey === "current"
            ? SCORING_CONFIG.CURRENT_MIN_OVERALL_MATCHES
            : SCORING_CONFIG.MIN_OVERALL_MATCHES)
            ? analytics.performance.overall === null
            : analytics.performance.overall !== null,
      };
      const failed = Object.entries(invariants).filter(([, passed]) => !passed).map(([key]) => key);
      if (failed.length) formulaFailures.push({ playerId, failed });
    }
    addCheck(
      `formulas-${periodKey}`,
      `Toutes les formules et bornes sont cohérentes pour ${periodKey}`,
      formulaFailures.length === 0,
      { checkedPlayers: secondaryIds.length, failures: formulaFailures },
    );

    // La vue équipe et les fiches événement n'ont pas toujours la même couverture historique.
    secondaryPeriod.teamMatchReconciliation = {
      officialSportEasyMatches: primaryPeriod.team?.metrics?.matchesPlayed?.value ?? null,
      detailedPastEvents: secondaryPeriod.matchCount,
      detailedEventsWithCompleteScore: secondaryPeriod.matchesWithCompleteScore,
    };
  }

  const samples = SAMPLE_PLAYER_IDS.map((playerId) => {
    const player = players.players.find((item) => String(item.sporteasyId) === playerId);
    const analytics = secondary.periods.allTime.players[playerId];
    const primary = statistics.periods.allTime.players[playerId];
    return {
      playerId,
      playerName: player?.displayName ?? null,
      officialSportEasy: {
        matches: rawMetric(statistics.periods.allTime, playerId, "matchesPlayed"),
        goals: rawMetric(statistics.periods.allTime, playerId, "goals"),
        assists: rawMetric(statistics.periods.allTime, playerId, "assists"),
      },
      secondary: {
        goalsPerGame: analytics?.finishing.goalsPerGame ?? null,
        assistsPerGame: analytics?.creation.assistsPerGame ?? null,
        contributions: analytics?.offensive.contributions ?? null,
        contributionsPerGame: analytics?.offensive.contributionsPerGame ?? null,
        last5Goals: analytics?.finishing.last5Goals ?? null,
        last5Assists: analytics?.creation.last5Assists ?? null,
        defensiveImpact: analytics?.defensive.collectiveObservedImpact ?? null,
        defensiveCoverage: analytics?.defensive.coverage.status ?? "unavailable",
        favoriteLineupCount: analytics?.collective.favoriteLineup.length ?? 0,
        performance: analytics?.performance ?? null,
      },
      trace: {
        officialPlayerRowPresent: Boolean(primary),
        detailedAppearances: analytics?.trace.detailedAppearanceCount ?? 0,
        issueCount: analytics?.trace.issues.length ?? 0,
      },
    };
  });
  addCheck(
    "real-player-samples",
    "Cinq joueurs réels sont rapprochés de leurs données primaires SportEasy",
    samples.every((sample) => sample.trace.officialPlayerRowPresent && sample.trace.issueCount === 0),
    { players: samples.map((sample) => sample.playerName), sampleCount: samples.length },
  );
  addCheck(
    "soft-weighted-model",
    "Les amicaux gardent leur valeur pleine ; compétition et ProTour sont progressivement bonifiés",
    secondary.metadata.formulaVersion === SCORING_CONFIG.VERSION && secondary.metadata.warningCount === 0,
    { formulaVersion: secondary.metadata.formulaVersion, warnings: secondary.metadata.warningCount },
  );

  const realizedMatches = matches.matches.filter((match) => match.status.isPast && !match.status.isCancelled);
  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "SportEasy primary repositories + Lykos secondary repository",
      status: checks.every((check) => check.status === "passed") ? "valid" : "invalid",
    },
    coverage: {
      players: players.players.length,
      currentPlayers: players.players.filter((player) => player.isCurrent).length,
      formerPlayers: players.players.filter((player) => !player.isCurrent).length,
      realizedStatisticalMatches: realizedMatches.length,
      completeScores: realizedMatches.filter((match) => match.status.hasCompleteScore).length,
      incompleteScores: realizedMatches.filter((match) => !match.status.hasCompleteScore).length,
    },
    checks,
    periodReconciliation: Object.fromEntries(PERIOD_KEYS.map((key) => [
      key,
      secondary.periods[key].teamMatchReconciliation,
    ])),
    samples,
  };
  await writeJsonAtomically(reportFile, report);
  console.log(`Audit des statistiques secondaires : ${report.metadata.status}.`);
  console.log(`- Contrôles réussis : ${checks.filter((check) => check.status === "passed").length}/${checks.length}`);
  console.log(`- Joueurs vérifiés exhaustivement : ${players.players.length} × ${PERIOD_KEYS.length} périodes`);
  console.log(`- Joueurs réels contrôlés en détail : ${samples.map((sample) => sample.playerName).join(", ")}`);
  console.log("- Rapport : data/private/sporteasy/player-secondary-audit-report.json");
  if (report.metadata.status !== "valid") process.exitCode = 1;
} catch (error) {
  console.error("Audit des statistiques secondaires impossible.");
  console.error(`- Message : ${error.message}`);
  process.exitCode = 1;
}
