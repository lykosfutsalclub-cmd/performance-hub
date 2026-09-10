import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { inspectJson } from "./lib/schema-inspector.mjs";
import { isInternalTrainingEvent } from "./lib/match-repository.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const rawDirectory = new URL("raw/statistics/events/", privateRoot);
const schemaDirectory = new URL("schema/statistics/events/", privateRoot);
const matchTypes = new Set([
  "championship_match",
  "challenge_match",
  "cup_match",
  "friendly_match",
  "tournament",
]);

function list(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.results)) return payload.results;
  throw new Error(`${label} n'est pas une liste.`);
}

function positiveId(value, label) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) throw new Error(`${label} invalide.`);
  return text;
}

async function readPrivate(relativePath) {
  return JSON.parse(await readFile(fileURLToPath(new URL(relativePath, privateRoot)), "utf8"));
}

try {
  const configuration = readConfiguration();
  const client = new ReadonlySportEasyClient(configuration);
  const seasons = list(await readPrivate("raw/statistics/seasons.json"), "La capture des saisons");
  const eventsById = new Map();

  for (const season of seasons) {
    const seasonId = positiveId(season?.id, "Identifiant de saison");
    const events = list(
      await readPrivate(`raw/statistics/season-${seasonId}-events.json`),
      `Les événements de la saison ${seasonId}`,
    );
    for (const event of events) {
      if (
        !matchTypes.has(event?.category?.type) ||
        isInternalTrainingEvent(event) ||
        event?.is_cancelled === true ||
        event?.is_past !== true
      ) {
        continue;
      }
      const eventId = positiveId(event?.id, "Identifiant d'événement");
      if (eventsById.has(eventId)) {
        throw new Error(`Le match ${eventId} apparaît plusieurs fois dans les captures saisonnières.`);
      }
      eventsById.set(eventId, {
        eventId,
        seasonId,
        categoryType: event.category.type,
        categorySlug: event.category.slug_name ?? null,
      });
    }
  }

  const manifest = {
    source: "SportEasy",
    capturedAt: new Date().toISOString(),
    expectedEventCount: eventsById.size,
    events: [],
    errors: [],
  };
  const pending = [...eventsById.values()];
  const concurrency = 5;

  async function worker() {
    while (pending.length) {
      const event = pending.shift();
      const endpoint = `teams/${configuration.teamId}/events/${event.eventId}/stats/`;
      try {
        const payload = await client.getJson(endpoint, { version: "2.1" });
        const capturedAt = new Date().toISOString();
        const fileName = `event-${event.eventId}.json`;
        await Promise.all([
          writeJsonAtomically(fileURLToPath(new URL(fileName, rawDirectory)), payload),
          writeJsonAtomically(
            fileURLToPath(new URL(fileName, schemaDirectory)),
            inspectJson(payload, {
              resource: `event-${event.eventId}-statistics`,
              endpoint: `/v2.1/${endpoint}`,
              capturedAt,
            }),
          ),
        ]);
        manifest.events.push({
          ...event,
          endpoint: `GET /v2.1/${endpoint}`,
          capturedAt,
        });
      } catch (error) {
        manifest.errors.push({
          ...event,
          endpoint: `GET /v2.1/${endpoint}`,
          errorKind: error?.kind ?? "unexpected",
          status: error?.status ?? null,
          message: error?.message ?? "Erreur inconnue",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  manifest.events.sort((left, right) => Number(left.eventId) - Number(right.eventId));
  manifest.errors.sort((left, right) => Number(left.eventId) - Number(right.eventId));
  manifest.validationStatus = manifest.errors.length === 0 ? "valid" : "incomplete";
  await writeJsonAtomically(
    fileURLToPath(new URL("event-statistics-manifest.json", privateRoot)),
    manifest,
  );

  console.log("Capture de toutes les fiches statistiques de match terminée (GET uniquement).");
  console.log(`- Matchs attendus : ${manifest.expectedEventCount}`);
  console.log(`- Matchs capturés : ${manifest.events.length}`);
  console.log(`- Erreurs : ${manifest.errors.length}`);
  console.log(`- Statut : ${manifest.validationStatus}`);
} catch (error) {
  if (error?.kind) printRequestError(error);
  else console.error(`Capture refusée : ${error.message}`);
  process.exitCode = 1;
}
