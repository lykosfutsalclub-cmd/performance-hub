import { readdir, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import {
  isInternalTrainingEvent,
  isStatisticalMatchEvent,
} from "./lib/match-repository.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const reportFile = fileURLToPath(new URL("match-audit-report.json", privateRoot));

async function readPrivate(relativePath) {
  return JSON.parse(await readFile(fileURLToPath(new URL(relativePath, privateRoot)), "utf8"));
}

function list(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.results)) return payload.results;
  throw new Error(`${label} n'est pas une liste.`);
}

function ids(values) {
  return values.map((value) => String(value)).sort((left, right) => Number(left) - Number(right));
}

function setDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function sameIds(left, right) {
  const leftIds = ids(left);
  const rightIds = ids(right);
  return leftIds.length === rightIds.length && leftIds.every((value, index) => value === rightIds[index]);
}

function percent(available, total) {
  return total === 0 ? null : Math.round((available / total) * 1000) / 10;
}

function metric(payload, path) {
  let value = payload;
  for (const key of path) value = value?.[key];
  return Number.isFinite(value) ? value : null;
}

function coverage(label, available, total, note = null) {
  return { label, available, total, percent: percent(available, total), note };
}

try {
  const [
    seasonsPayload,
    eventManifest,
    aggregateManifest,
    statisticsRepository,
    matchRepository,
    allGlobal,
  ] = await Promise.all([
    readPrivate("raw/statistics/seasons.json"),
    readPrivate("event-statistics-manifest.json"),
    readPrivate("statistics-aggregate-manifest.json"),
    readPrivate("statistics-repository.json"),
    readPrivate("match-repository.json"),
    readPrivate("raw/statistics/aggregate/all-global.json"),
  ]);
  const seasons = list(seasonsPayload, "Les saisons");
  const allCalendarEvents = [];
  for (const season of seasons) {
    const seasonEvents = list(
      await readPrivate(`raw/statistics/season-${season.id}-events.json`),
      `Les événements de la saison ${season.id}`,
    );
    allCalendarEvents.push(...seasonEvents);
  }

  const realizedMatchEvents = allCalendarEvents.filter(
    (event) =>
      isStatisticalMatchEvent(event) &&
      event?.is_past === true &&
      event?.is_cancelled !== true,
  );
  const allMatchEvents = allCalendarEvents.filter(isStatisticalMatchEvent);
  const realizedTournamentContainers = allCalendarEvents.filter(
    (event) =>
      event?.category?.type === "tournament" &&
      event?.is_past === true &&
      event?.is_cancelled !== true,
  );
  const expectedRawCaptureEvents = [
    ...realizedMatchEvents,
    ...realizedTournamentContainers,
  ];
  const manifestIds = ids(eventManifest.events.map((event) => event.eventId));
  const realizedIds = ids(realizedMatchEvents.map((event) => event.id));
  const expectedRawCaptureIds = ids(expectedRawCaptureEvents.map((event) => event.id));
  const repositoryIds = ids(matchRepository.matches.map((match) => match.eventId));
  const allMatchIds = ids(allMatchEvents.map((event) => event.id));

  const statisticsDirectory = fileURLToPath(new URL("raw/statistics/events/", privateRoot));
  const uiDirectory = fileURLToPath(new URL("raw/match-ui/", privateRoot));
  const statisticsFiles = (await readdir(statisticsDirectory)).filter((file) => /^event-\d+\.json$/.test(file));
  const uiFiles = (await readdir(uiDirectory)).filter((file) => /^event-\d+\.json$/.test(file));
  const statisticsFileIds = ids(statisticsFiles.map((file) => basename(file, ".json").slice(6)));
  const uiFileIds = ids(uiFiles.map((file) => basename(file, ".json").slice(6)));

  const uiCaptures = await Promise.all(uiFiles.map((file) => readPrivate(`raw/match-ui/${file}`)));
  const uiCompleteIds = ids(
    uiCaptures
      .filter(
        (capture) =>
          capture.errors?.length === 0 &&
          capture.routes?.summary &&
          capture.routes?.presence &&
          capture.routes?.report,
      )
      .map((capture) => capture.eventId),
  );

  const seasonGlobalPayloads = await Promise.all(
    aggregateManifest.requests
      .filter((request) => request.kind === "global" && request.seasonId)
      .map(async (request) => ({
        request,
        payload: await readPrivate(`raw/statistics/aggregate/${request.resource}.json`),
      })),
  );
  const officialFields = {
    matchesPlayed: ["charts_data", "num_played_events"],
    wins: ["charts_data", "outcomes", "match_outcome_victory_sum"],
    draws: ["charts_data", "outcomes", "match_outcome_tie_sum"],
    losses: ["charts_data", "outcomes", "match_outcome_defeat_sum"],
    goalsFor: ["charts_data", "scores", "score_for_sum"],
    goalsAgainst: ["charts_data", "scores", "score_against_sum"],
  };
  const officialReconciliation = {};
  for (const [key, path] of Object.entries(officialFields)) {
    const allTimeValue = metric(allGlobal, path);
    const seasonSum = seasonGlobalPayloads.reduce(
      (sum, capture) => sum + (metric(capture.payload, path) ?? 0),
      0,
    );
    const repositoryValue = matchRepository.aggregates.officialPeriods?.allTime?.metrics?.[key]?.value ?? null;
    officialReconciliation[key] = {
      allTimeValue,
      seasonSum,
      repositoryValue,
      reconciled: allTimeValue === seasonSum && allTimeValue === repositoryValue,
    };
  }

  const realizedMatches = matchRepository.matches.filter(
    (match) => match.status.isPast && !match.status.isCancelled,
  );
  const checks = [];
  const addCheck = (id, label, passed, details) =>
    checks.push({ id, label, status: passed ? "passed" : "failed", details });

  addCheck("season-manifest", "Toutes les saisons annoncées sont présentes", seasons.length === matchRepository.metadata.seasonCount, {
    source: seasons.length,
    repository: matchRepository.metadata.seasonCount,
  });
  addCheck("event-manifest", "Le manifeste des matchs est valide et sans erreur", eventManifest.validationStatus === "valid" && eventManifest.errors.length === 0, {
    expected: eventManifest.expectedEventCount,
    captured: eventManifest.events.length,
    errors: eventManifest.errors.length,
  });
  addCheck("raw-capture-set", "Le manifeste brut couvre les vrais matchs et les conteneurs de tournoi", setDifference(expectedRawCaptureIds, manifestIds).length === 0, {
    expectedCount: expectedRawCaptureIds.length,
    capturedCount: manifestIds.length,
    missing: setDifference(expectedRawCaptureIds, manifestIds),
    unexpected: setDifference(manifestIds, expectedRawCaptureIds),
  });
  addCheck("statistics-files", "Chaque match attendu possède son fichier statistique", sameIds(manifestIds, statisticsFileIds), {
    expectedCount: manifestIds.length,
    fileCount: statisticsFileIds.length,
    missing: setDifference(manifestIds, statisticsFileIds),
    unexpected: setDifference(statisticsFileIds, manifestIds),
  });
  addCheck("ui-files", "Chaque match attendu possède sa capture SportEasy visible", sameIds(manifestIds, uiFileIds), {
    expectedCount: manifestIds.length,
    fileCount: uiFileIds.length,
    missing: setDifference(manifestIds, uiFileIds),
    unexpected: setDifference(uiFileIds, manifestIds),
  });
  addCheck("ui-routes", "Bilan, présences et compte rendu sont complets pour chaque match", sameIds(manifestIds, uiCompleteIds), {
    expectedCount: manifestIds.length,
    completeCount: uiCompleteIds.length,
    incomplete: setDifference(manifestIds, uiCompleteIds),
  });
  addCheck("repository-match-set", "Le référentiel contient exactement tous les événements de type match", sameIds(allMatchIds, repositoryIds), {
    expectedCount: allMatchIds.length,
    repositoryCount: repositoryIds.length,
    missing: setDifference(allMatchIds, repositoryIds),
    unexpected: setDifference(repositoryIds, allMatchIds),
  });
  const repositoryRealizedIds = ids(
    matchRepository.matches
      .filter((match) => match.status.isPast && !match.status.isCancelled)
      .map((match) => match.eventId),
  );
  addCheck("business-match-set", "Les matchs entre nous et conteneurs de tournoi sont absents des vrais matchs", sameIds(realizedIds, repositoryRealizedIds), {
    expectedRealizedMatchCount: realizedIds.length,
    repositoryRealizedMatchCount: repositoryRealizedIds.length,
    missing: setDifference(realizedIds, repositoryRealizedIds),
    unexpected: setDifference(repositoryRealizedIds, realizedIds),
  });
  const internalTrainingIds = ids(allCalendarEvents.filter(isInternalTrainingEvent).map((event) => event.id));
  addCheck("internal-training-rule", "Tous les matchs entre nous sont classés comme entraînements et aucun n'alimente les matchs", internalTrainingIds.every((eventId) => !repositoryIds.includes(eventId)) && internalTrainingIds.length === matchRepository.metadata.internalTrainingEventCount, {
    internalTrainingEventCount: internalTrainingIds.length,
    repositoryInternalTrainingEventCount: matchRepository.metadata.internalTrainingEventCount,
    wronglyIncluded: internalTrainingIds.filter((eventId) => repositoryIds.includes(eventId)),
  });
  const tournamentLinks = matchRepository.tournaments?.links ?? [];
  const linkedContainerIds = new Set(tournamentLinks.map((link) => link.tournamentContainerId));
  const linkedMatchIds = new Set(tournamentLinks.map((link) => link.matchEventId));
  const validTournamentLinks = tournamentLinks.every((link) => {
    const container = matchRepository.tournaments.containers.find(
      (item) => item.eventId === link.tournamentContainerId,
    );
    const match = matchRepository.matches.find((item) => item.eventId === link.matchEventId);
    return container && match && container.day === match.day && match.tournamentContainerId === container.eventId;
  });
  addCheck("tournament-links", "Chaque tournoi rattaché pointe vers un unique match récapitulatif du même jour", validTournamentLinks && linkedContainerIds.size === tournamentLinks.length && linkedMatchIds.size === tournamentLinks.length, {
    linkedCount: tournamentLinks.length,
    links: tournamentLinks,
  });
  addCheck("repository-valid", "Le référentiel publié est déclaré valide", matchRepository.metadata.validationStatus === "valid", {
    validationStatus: matchRepository.metadata.validationStatus,
  });
  addCheck("official-aggregates", "Les agrégats officiels par saison, All-time et référentiel concordent", Object.values(officialReconciliation).every((item) => item.reconciled), officialReconciliation);

  const officialMatches = officialReconciliation.matchesPlayed.allTimeValue;
  const officialWins = officialReconciliation.wins.allTimeValue;
  const officialDraws = officialReconciliation.draws.allTimeValue;
  const officialLosses = officialReconciliation.losses.allTimeValue;
  addCheck("official-outcomes", "Les victoires, nuls et défaites reconstituent le nombre officiel de matchs", officialWins + officialDraws + officialLosses === officialMatches, {
    matches: officialMatches,
    wins: officialWins,
    draws: officialDraws,
    losses: officialLosses,
  });
  const ignoredUnavailableEvents =
    statisticsRepository.metadata.unavailableEventCount -
    (realizedMatches.length - matchRepository.metadata.completedMatchCount);
  addCheck("detail-totals", "Les scores détaillés concordent après exclusion des entraînements internes et conteneurs de tournoi", matchRepository.metadata.completedMatchCount === statisticsRepository.metadata.completedEventCount && ignoredUnavailableEvents === 0, {
    detailedScores: matchRepository.metadata.completedMatchCount,
    expectedDetailedScores: statisticsRepository.metadata.completedEventCount,
    unavailableTrueMatches: realizedMatches.length - matchRepository.metadata.completedMatchCount,
    unavailableInRawCapture: statisticsRepository.metadata.unavailableEventCount,
    ignoredTournamentAndInternalEvents: ignoredUnavailableEvents,
  });

  const attendanceUnsetEvents = realizedMatches
    .filter((match) => match.attendance.entries.length === 0)
    .map((match) => ({ eventId: match.eventId, day: match.day, name: match.name }));
  const playerStatsUnsetEvents = realizedMatches
    .filter((match) => match.playerStatistics.length === 0)
    .map((match) => ({ eventId: match.eventId, day: match.day, name: match.name }));
  const missingOpponentEvents = realizedMatches
    .filter((match) => !match.opponent)
    .map((match) => ({ eventId: match.eventId, day: match.day, type: match.category.type, name: match.name }));

  const coverageRows = [
    coverage("Saison", realizedMatches.filter((match) => match.seasonId).length, realizedMatches.length),
    coverage("Date et horaire", realizedMatches.filter((match) => match.startAt).length, realizedMatches.length),
    coverage("Catégorie", realizedMatches.filter((match) => match.category.type).length, realizedMatches.length),
    coverage("Bilan SportEasy récupéré", realizedMatches.filter((match) => match.capture.summary).length, realizedMatches.length),
    coverage("Page de présences récupérée", realizedMatches.filter((match) => match.capture.presence).length, realizedMatches.length),
    coverage("Statuts de présence renseignés", realizedMatches.filter((match) => match.attendance.entries.length > 0).length, realizedMatches.length, "Une page peut être récupérée sans qu'un statut ait été coché dans SportEasy."),
    coverage("Adversaire identifiable", realizedMatches.filter((match) => match.opponent).length, realizedMatches.length, "Les conteneurs de tournoi et les oppositions internes Bleus/Noirs n'ont pas d'adversaire Lykos classique."),
    coverage("Lieu renseigné", realizedMatches.filter((match) => match.venue).length, realizedMatches.length),
    coverage("Score détaillé des deux équipes", realizedMatches.filter((match) => match.status.hasCompleteScore).length, realizedMatches.length, "Les agrégats officiels SportEasy récupèrent davantage de totaux que les fiches individuelles."),
    coverage("Statistiques joueurs renseignées", realizedMatches.filter((match) => match.playerStatistics.length > 0).length, realizedMatches.length),
    coverage("Page de compte rendu récupérée", realizedMatches.filter((match) => match.capture.report).length, realizedMatches.length),
    coverage("Compte rendu textuel renseigné", realizedMatches.filter((match) => match.report).length, realizedMatches.length, "Toutes les pages existent, mais aucun texte n'a été saisi dans SportEasy."),
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    source: "Audit croisé des captures SportEasy locales",
    status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
    summary: {
      checksPassed: checks.filter((check) => check.status === "passed").length,
      checksFailed: checks.filter((check) => check.status === "failed").length,
      seasons: seasons.length,
      structuredCalendarEvents: allCalendarEvents.length,
      knownCalendarEventsAfterUiCheck: matchRepository.metadata.calendarKnownEventCount,
      matchEvents: allMatchEvents.length,
      realizedNonCancelledMatchEvents: realizedMatches.length,
      internalTrainingEvents: internalTrainingIds.length,
      tournamentContainers: matchRepository.metadata.tournamentContainerCount,
      linkedTournamentContainers: matchRepository.metadata.linkedTournamentContainerCount,
      expectedRawCaptureEvents: expectedRawCaptureIds.length,
      statisticsFiles: statisticsFiles.length,
      completeUiCaptures: uiCompleteIds.length,
      trueMatchStatisticsCaptures: matchRepository.metadata.statisticsCaptureCount,
      trueMatchUiCaptures: matchRepository.metadata.uiCaptureCount,
      attendanceAssignments: realizedMatches.reduce((sum, match) => sum + match.attendance.entries.length, 0),
      playerMatchRows: realizedMatches.reduce((sum, match) => sum + match.playerStatistics.length, 0),
      uniqueAttendancePlayers: new Set(realizedMatches.flatMap((match) => match.attendance.entries.map((entry) => entry.profileId))).size,
      uniqueStatisticsPlayers: new Set(realizedMatches.flatMap((match) => match.playerStatistics.map((player) => player.profileId))).size,
    },
    checks,
    coverage: coverageRows,
    sourceGaps: {
      attendanceUnsetEvents,
      playerStatsUnsetEventCount: playerStatsUnsetEvents.length,
      playerStatsUnsetEvents,
      missingOpponentEventCount: missingOpponentEvents.length,
      missingOpponentEvents,
      missingVenueEventCount: realizedMatches.filter((match) => !match.venue).length,
      incompleteScoreEventCount: realizedMatches.filter((match) => !match.status.hasCompleteScore).length,
      populatedReportCount: realizedMatches.filter((match) => match.report).length,
      currentSeasonUiOnlyEventCount: matchRepository.metadata.currentSeasonUiOnlyCount,
    },
  };

  await writeJsonAtomically(reportFile, report);
  console.log(`Audit calendrier et matchs : ${report.status === "passed" ? "RÉUSSI" : "ÉCHEC"}`);
  console.log(`- Contrôles réussis : ${report.summary.checksPassed}/${report.checks.length}`);
  console.log(`- Saisons : ${report.summary.seasons}`);
  console.log(`- Événements de calendrier connus : ${report.summary.knownCalendarEventsAfterUiCheck}`);
  console.log(`- Fichiers bruts conservés / événements encore attendus : ${report.summary.statisticsFiles}/${report.summary.expectedRawCaptureEvents}`);
  console.log(`- Vrais matchs avec statistiques : ${report.summary.trueMatchStatisticsCaptures}/${report.summary.realizedNonCancelledMatchEvents}`);
  console.log(`- Vrais matchs avec bilan + présences + compte rendu : ${report.summary.trueMatchUiCaptures}/${report.summary.realizedNonCancelledMatchEvents}`);
  console.log(`- Affectations de présence exploitables : ${report.summary.attendanceAssignments}`);
  console.log(`- Lignes joueur-match exploitables : ${report.summary.playerMatchRows}`);
  console.log(`- Lacunes de collecte critiques : ${report.summary.checksFailed}`);
  console.log("- Rapport privé : data/private/sporteasy/match-audit-report.json");
  if (report.status !== "passed") process.exitCode = 1;
} catch (error) {
  console.error("Audit calendrier et matchs impossible.");
  console.error(`- Message : ${error.message}`);
  process.exitCode = 1;
}
