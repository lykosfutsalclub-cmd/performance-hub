import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { isInternalTrainingEvent } from "./lib/match-repository.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const matchTypes = new Set(["championship_match", "challenge_match", "cup_match", "friendly_match", "tournament"]);

async function readPrivate(relativePath) {
  return JSON.parse(await readFile(fileURLToPath(new URL(relativePath, privateRoot)), "utf8"));
}

function list(payload) {
  return Array.isArray(payload) ? payload : payload.results;
}

const seasons = list(await readPrivate("raw/statistics/seasons.json"));
const events = [];

for (const season of seasons) {
  for (const event of list(await readPrivate(`raw/statistics/season-${season.id}-events.json`))) {
    if (!matchTypes.has(event?.category?.type) || isInternalTrainingEvent(event) || event?.is_cancelled === true || event?.is_past !== true) continue;
    const eventId = String(event.id);
    await access(fileURLToPath(new URL(`raw/statistics/events/event-${eventId}.json`, privateRoot)));
    events.push({
      eventId,
      seasonId: String(season.id),
      categoryType: event.category.type,
      categorySlug: event.category.slug_name ?? null,
      endpoint: `GET /v2.1/teams/1080887/events/${eventId}/stats/`,
      capturedAt: null,
    });
  }
}

events.sort((left, right) => Number(left.eventId) - Number(right.eventId));
const knownEventIds = new Set(events.map((event) => event.eventId));
const cachedFiles = await readdir(fileURLToPath(new URL("raw/statistics/events/", privateRoot)));
for (const file of cachedFiles.filter((name) => /^event-\d+\.json$/.test(name))) {
  const eventId = /^event-(\d+)\.json$/.exec(file)[1];
  if (knownEventIds.has(eventId)) continue;
  const uiCapture = await readPrivate(`raw/match-ui/event-${eventId}.json`);
  events.push({
    eventId,
    seasonId: String(uiCapture.seasonId),
    categoryType: uiCapture.categoryType ?? null,
    categorySlug: uiCapture.categorySlug ?? null,
    endpoint: `GET /v2.1/teams/1080887/events/${eventId}/stats/`,
    capturedAt: null,
    retainedFromCurrentSeasonUi: true,
  });
}
events.sort((left, right) => Number(left.eventId) - Number(right.eventId));
await writeJsonAtomically(fileURLToPath(new URL("event-statistics-manifest.json", privateRoot)), {
  source: "SportEasy",
  capturedAt: new Date().toISOString(),
  expectedEventCount: events.length,
  events,
  errors: [],
  validationStatus: "valid",
  recoveredFromValidatedCache: true,
});

console.log(`Manifeste restauré à partir de ${events.length} fiches statistiques déjà présentes.`);
