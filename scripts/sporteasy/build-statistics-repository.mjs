import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { buildStatisticsRepository } from "./lib/statistics-repository.mjs";
import { isStatisticalMatchEvent } from "./lib/match-repository.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const statisticsFile = fileURLToPath(new URL("statistics-repository.json", privateRoot));
const playersFile = fileURLToPath(new URL("players-repository.json", privateRoot));

async function readPrivate(relativePath) {
  return JSON.parse(await readFile(fileURLToPath(new URL(relativePath, privateRoot)), "utf8"));
}

function list(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.results)) return payload.results;
  throw new Error(`${label} n'est pas une liste.`);
}

try {
  const [seasonsPayload, playersRepository, detailsManifest, aggregateManifest, eventsManifest] = await Promise.all([
    readPrivate("raw/statistics/seasons.json"),
    readPrivate("players-repository.json"),
    readPrivate("statistics-capture-manifest.json"),
    readPrivate("statistics-aggregate-manifest.json"),
    readPrivate("event-statistics-manifest.json"),
  ]);
  if (eventsManifest.validationStatus !== "valid" || eventsManifest.errors?.length) {
    throw new Error("La capture des fiches de match est incomplète : aucune publication possible.");
  }
  if (aggregateManifest.validationStatus !== "valid" || aggregateManifest.errors?.length) {
    throw new Error("La capture officielle « Tous les matchs » est incomplète : aucune publication possible.");
  }
  const seasons = list(seasonsPayload, "Les saisons");
  const seasonIds = new Set(seasons.map((season) => String(season.id)));
  const eventIndex = new Map();
  for (const seasonId of seasonIds) {
    const events = list(
      await readPrivate(`raw/statistics/season-${seasonId}-events.json`),
      `Les événements ${seasonId}`,
    );
    for (const event of events) eventIndex.set(String(event.id), event);
  }

  const playerCaptures = [];
  const globalCaptures = [];
  const rankingCaptures = [];
  for (const request of detailsManifest.requests) {
    if (!new Set(["global", "players", "rankings"]).has(request.kind)) continue;
    const payload = await readPrivate(
      `raw/statistics/details/season-${request.seasonId}-category-${request.categoryId}-${request.kind}.json`,
    );
    const capture = { ...request, payload };
    if (request.kind === "players") playerCaptures.push(capture);
    else if (request.kind === "global") globalCaptures.push(capture);
    else rankingCaptures.push(capture);
  }

  const aggregatePlayerCaptures = [];
  const aggregateGlobalCaptures = [];
  for (const request of aggregateManifest.requests) {
    const payload = await readPrivate(`raw/statistics/aggregate/${request.resource}.json`);
    const capture = { ...request, payload };
    if (request.kind === "players") aggregatePlayerCaptures.push(capture);
    else if (request.kind === "global") aggregateGlobalCaptures.push(capture);
  }

  const eventSources = [];
  for (const event of eventsManifest.events) {
    const eventSummary = eventIndex.get(String(event.eventId));
    if (!eventSummary) throw new Error(`Le match ${event.eventId} n'existe pas dans les listes saisonnières.`);
    if (!isStatisticalMatchEvent(eventSummary)) continue;
    eventSources.push({
      ...event,
      startAt: eventSummary.start_at ?? null,
      payload: await readPrivate(`raw/statistics/events/event-${event.eventId}.json`),
    });
  }

  const previousPlayerCount = playersRepository.players.length;
  const { repository, enrichedPlayersRepository } = buildStatisticsRepository({
    teamId: 1080887,
    seasons,
    playerCaptures,
    globalCaptures,
    aggregatePlayerCaptures,
    aggregateGlobalCaptures,
    rankingCaptures,
    eventSources,
    playersRepository,
  });

  await writeJsonAtomically(statisticsFile, repository);
  await writeJsonAtomically(playersFile, enrichedPlayersRepository);

  console.log("Référentiel statistique SportEasy validé et publié localement.");
  console.log(`- Saisons analysées : ${repository.metadata.seasonsAnalyzed.length}`);
  console.log(`- Matchs uniques analysés : ${repository.metadata.uniqueEventCount}`);
  console.log(`- Matchs avec résultat complet : ${repository.metadata.completedEventCount}`);
  console.log(`- Matchs incomplets conservés comme indisponibles : ${repository.metadata.unavailableEventCount}`);
  console.log(`- Joueurs historiques avant enrichissement : ${previousPlayerCount}`);
  console.log(`- Joueurs historiques après enrichissement : ${enrichedPlayersRepository.players.length}`);
  console.log(
    `- IDs historiques ajoutés par les statistiques : ` +
      `${enrichedPlayersRepository.metadata.historicalPlayersAddedFromStatistics.join(", ") || "aucun"}`,
  );
  console.log("- Fichier privé : data/private/sporteasy/statistics-repository.json");
} catch (error) {
  console.error("Publication statistique refusée.");
  console.error(`- Message : ${error.message}`);
  if (error?.details?.orphanPlayerIds) {
    console.error(`- Joueurs orphelins : ${error.details.orphanPlayerIds.join(", ")}`);
  }
  console.error("- Le dernier référentiel statistique valide, s'il existe, est conservé.");
  process.exitCode = 1;
}
