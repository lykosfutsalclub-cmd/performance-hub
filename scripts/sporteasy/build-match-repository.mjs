import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { buildMatchRepository } from "./lib/match-repository.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const outputFile = fileURLToPath(new URL("match-repository.json", privateRoot));

async function readPrivate(relativePath) {
  return JSON.parse(await readFile(fileURLToPath(new URL(relativePath, privateRoot)), "utf8"));
}

function list(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.results)) return payload.results;
  throw new Error(`${label} n'est pas une liste.`);
}

try {
  const [seasonsPayload, playersRepository, statisticsRepository, eventManifest, eventDetailsManifest, calendarUiCapture] = await Promise.all([
    readPrivate("raw/statistics/seasons.json"),
    readPrivate("players-repository.json"),
    readPrivate("statistics-repository.json"),
    readPrivate("event-statistics-manifest.json"),
    readPrivate("event-details-manifest.json"),
    readPrivate("raw/calendar-ui/calendar-all-seasons.json").catch(() => null),
  ]);
  if (eventManifest.validationStatus !== "valid" || eventManifest.errors?.length) {
    throw new Error("La capture statistique des matchs est incomplète.");
  }
  if (eventDetailsManifest.validationStatus !== "valid" || eventDetailsManifest.errors?.length) {
    throw new Error("La capture des fiches générales de match est incomplète.");
  }

  const seasons = list(seasonsPayload, "Les saisons");
  const eventsBySeason = new Map();
  for (const season of seasons) {
    const seasonId = String(season.id);
    eventsBySeason.set(
      seasonId,
      list(
        await readPrivate(`raw/statistics/season-${seasonId}-events.json`),
        `Les événements de la saison ${seasonId}`,
      ),
    );
  }
  const effectiveCalendarUiCapture = calendarUiCapture ?? {
    source:"SportEasy API",
    seasons:seasons.map((season) => ({
      name:season.name,
      events:(eventsBySeason.get(String(season.id)) ?? []).map((event) => ({href:`/event/${event.id}/`})),
    })),
  };

  const statisticsByEvent = new Map();
  for (const event of eventManifest.events) {
    statisticsByEvent.set(
      String(event.eventId),
      await readPrivate(`raw/statistics/events/event-${event.eventId}.json`),
    );
  }

  const detailsByEvent = new Map();
  for (const event of eventDetailsManifest.events) {
    detailsByEvent.set(String(event.eventId), {
      stats: {
        event_rating: event.eventRating
          ? {
              average: event.eventRating.average,
              nb_votes: event.eventRating.voteCount,
            }
          : null,
      },
    });
  }

  const uiByEvent = new Map();
  const uiDirectory = fileURLToPath(new URL("raw/match-ui/", privateRoot));
  const uiFiles = (await readdir(uiDirectory)).filter((name) => /^event-\d+\.json$/.test(name));
  for (const file of uiFiles) {
    const capture = await readPrivate(`raw/match-ui/${file}`);
    uiByEvent.set(String(capture.eventId), capture);
  }

  const repository = buildMatchRepository({
    teamId: 1080887,
    seasons,
    eventsBySeason,
    statisticsByEvent,
    detailsByEvent,
    uiByEvent,
    playersRepository,
    calendarUiCapture:effectiveCalendarUiCapture,
    statisticsRepository,
  });
  if (repository.metadata.validationStatus !== "valid") {
    throw new Error("Au moins une fiche SportEasy contient encore une erreur de capture.");
  }
  if (repository.metadata.statisticsCaptureCount !== repository.metadata.pastNonCancelledMatchCount) {
    throw new Error("Le nombre de statistiques des vrais matchs ne correspond pas au calendrier.");
  }
  if (repository.metadata.eventDetailsCaptureCount !== repository.metadata.pastNonCancelledMatchCount) {
    throw new Error("Le nombre de fiches générales ne correspond pas au calendrier.");
  }
  if (repository.metadata.uiCaptureCount !== repository.metadata.pastNonCancelledMatchCount) {
    throw new Error("Le nombre de fiches visibles des vrais matchs ne correspond pas au calendrier.");
  }

  await writeJsonAtomically(outputFile, repository);
  console.log("Référentiel calendrier et matchs SportEasy publié localement.");
  console.log(`- Saisons : ${repository.metadata.seasonCount}`);
  console.log(`- Événements de calendrier structurés : ${repository.metadata.calendarEventCount}`);
  console.log(`- Événements connus après contrôle de la saison actuelle : ${repository.metadata.calendarKnownEventCount}`);
  console.log(`- Matchs recensés : ${repository.metadata.matchEventCount}`);
  console.log(`- Matchs affichés par le tableau de bord SportEasy : ${repository.metadata.sportEasyDashboardMatchCount}`);
  console.log(`- Vrais matchs non annulés après règle métier : ${repository.metadata.statisticalMatchCount}`);
  console.log(`- Matchs passés non annulés : ${repository.metadata.pastNonCancelledMatchCount}`);
  console.log(`- Matchs avec score complet : ${repository.metadata.completedMatchCount}`);
  console.log(`- Fiches sportives complètes : ${repository.metadata.uiCaptureCount}`);
  console.log(`- Fiches générales de match : ${repository.metadata.eventDetailsCaptureCount}`);
  console.log(`- Matchs avec une note sur 6 : ${repository.metadata.ratedEventCount}`);
  console.log(`- Comptes rendus renseignés : ${repository.metadata.populatedReportCount}`);
  console.log(`- Matchs entre nous reclassés en entraînements : ${repository.metadata.internalTrainingEventCount}`);
  console.log(`- Tournois rattachés à un match récapitulatif : ${repository.metadata.linkedTournamentContainerCount}`);
  console.log(`- Tournois anciens sans match récapitulatif identifiable : ${repository.metadata.unlinkedTournamentContainerCount}`);
  console.log("- Fichier privé : data/private/sporteasy/match-repository.json");
} catch (error) {
  console.error("Publication du référentiel calendrier et matchs refusée.");
  console.error(`- Message : ${error.message}`);
  console.error("- Le dernier référentiel valide, s'il existe, est conservé.");
  process.exitCode = 1;
}
