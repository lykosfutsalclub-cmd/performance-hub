import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { inspectJson } from "./lib/schema-inspector.mjs";
import { isStatisticalMatchEvent } from "./lib/match-repository.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const rawDirectory = new URL("raw/statistics/event-details/", privateRoot);
const schemaDirectory = new URL("schema/statistics/event-details/", privateRoot);

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

function validateEventRating(payload, eventId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`La fiche du match ${eventId} n'est pas un objet JSON.`);
  }
  if (String(payload.id ?? "") !== eventId) {
    throw new Error(`La fiche reçue ne correspond pas au match ${eventId}.`);
  }
  const rating = payload?.stats?.event_rating;
  if (rating === null || rating === undefined) return null;
  if (!rating || typeof rating !== "object" || Array.isArray(rating)) {
    throw new Error(`La note du match ${eventId} a une structure inattendue.`);
  }
  const average = Number(rating.average);
  const voteCount = Number(rating.nb_votes);
  if (!Number.isFinite(average) || average < 1 || average > 6) {
    throw new Error(`La moyenne du match ${eventId} n'est pas comprise entre 1 et 6.`);
  }
  if (!Number.isInteger(voteCount) || voteCount < 1) {
    throw new Error(`Le nombre de votes du match ${eventId} est invalide.`);
  }
  return { average, voteCount };
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
        !isStatisticalMatchEvent(event) ||
        event?.is_cancelled === true ||
        event?.is_past !== true
      ) {
        continue;
      }
      const eventId = positiveId(event?.id, "Identifiant d'événement");
      if (eventsById.has(eventId)) {
        throw new Error(`Le match ${eventId} apparaît plusieurs fois dans les captures saisonnières.`);
      }
      eventsById.set(eventId, { eventId, seasonId });
    }
  }

  const manifest = {
    source: "SportEasy",
    capturedAt: new Date().toISOString(),
    endpointTemplate: "GET /v2.1/teams/{teamId}/events/{eventId}/",
    expectedEventCount: eventsById.size,
    ratedEventCount: 0,
    events: [],
    errors: [],
  };
  const pending = [...eventsById.values()];

  async function worker() {
    while (pending.length) {
      const event = pending.shift();
      const endpoint = `teams/${configuration.teamId}/events/${event.eventId}/`;
      try {
        const payload = await client.getJson(endpoint, { version: "2.1" });
        const eventRating = validateEventRating(payload, event.eventId);
        const capturedAt = new Date().toISOString();
        const fileName = `event-${event.eventId}.json`;
        await Promise.all([
          writeJsonAtomically(fileURLToPath(new URL(fileName, rawDirectory)), payload),
          writeJsonAtomically(
            fileURLToPath(new URL(fileName, schemaDirectory)),
            inspectJson(payload, {
              resource: `event-${event.eventId}-details`,
              endpoint: `/v2.1/${endpoint}`,
              capturedAt,
            }),
          ),
        ]);
        if (eventRating) manifest.ratedEventCount += 1;
        manifest.events.push({
          ...event,
          endpoint: `GET /v2.1/${endpoint}`,
          capturedAt,
          hasEventRating: Boolean(eventRating),
          eventRating,
        });
      } catch (error) {
        manifest.errors.push({
          ...event,
          endpoint: `GET /v2.1/${endpoint}`,
          errorKind: error?.kind ?? "invalid-response",
          status: error?.status ?? null,
          message: error?.message ?? "Erreur inconnue",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: 5 }, () => worker()));
  manifest.events.sort((left, right) => Number(left.eventId) - Number(right.eventId));
  manifest.errors.sort((left, right) => Number(left.eventId) - Number(right.eventId));
  manifest.validationStatus =
    manifest.errors.length === 0 && manifest.events.length === manifest.expectedEventCount
      ? "valid"
      : "incomplete";
  await writeJsonAtomically(
    fileURLToPath(new URL("event-details-manifest.json", privateRoot)),
    manifest,
  );

  console.log("Capture des fiches générales de match terminée (GET uniquement).");
  console.log(`- Matchs attendus : ${manifest.expectedEventCount}`);
  console.log(`- Fiches capturées : ${manifest.events.length}`);
  console.log(`- Matchs avec une note sur 6 : ${manifest.ratedEventCount}`);
  console.log(`- Erreurs : ${manifest.errors.length}`);
  console.log(`- Statut : ${manifest.validationStatus}`);
} catch (error) {
  if (error?.kind) printRequestError(error);
  else console.error(`Capture refusée : ${error.message}`);
  process.exitCode = 1;
}
