import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { inspectJson } from "./lib/schema-inspector.mjs";
import { isInternalTrainingEvent } from "./lib/match-repository.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const rawDirectory = new URL("raw/statistics/event-samples/", privateRoot);
const schemaDirectory = new URL("schema/statistics/event-samples/", privateRoot);
const matchTypes = new Set([
  "championship_match",
  "challenge_match",
  "cup_match",
  "friendly_match",
  "tournament",
]);

function list(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.results)) return payload.results;
  throw new Error("Une capture d'événements n'est pas une liste.");
}

function positiveId(value, label) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) throw new Error(`${label} invalide.`);
  return text;
}

async function readPrivate(relativePath) {
  return JSON.parse(await readFile(fileURLToPath(new URL(relativePath, privateRoot)), "utf8"));
}

async function capture(client, { eventId, kind, endpoint }) {
  const payload = await client.getJson(endpoint, { version: "2.1" });
  const resource = `event-${eventId}-${kind}`;
  const capturedAt = new Date().toISOString();
  await Promise.all([
    writeJsonAtomically(fileURLToPath(new URL(`${resource}.json`, rawDirectory)), payload),
    writeJsonAtomically(
      fileURLToPath(new URL(`${resource}.json`, schemaDirectory)),
      inspectJson(payload, { resource, endpoint: `/v2.1/${endpoint}`, capturedAt }),
    ),
  ]);
}

try {
  const configuration = readConfiguration();
  const client = new ReadonlySportEasyClient(configuration);
  const seasons = list(await readPrivate("raw/statistics/seasons.json"));
  const samples = new Map();

  for (const season of seasons) {
    const seasonId = positiveId(season?.id, "Identifiant de saison");
    const events = list(await readPrivate(`raw/statistics/season-${seasonId}-events.json`));
    for (const event of events) {
      const categoryType = event?.category?.type;
      if (
        !matchTypes.has(categoryType) ||
        isInternalTrainingEvent(event) ||
        event?.is_cancelled === true ||
        event?.is_past !== true ||
        samples.has(categoryType)
      ) {
        continue;
      }
      samples.set(categoryType, positiveId(event?.id, "Identifiant d'événement"));
    }
  }

  const manifest = { source: "SportEasy", capturedAt: new Date().toISOString(), samples: [], errors: [] };
  for (const [categoryType, eventId] of samples) {
    const base = `teams/${configuration.teamId}/events/${eventId}`;
    const requests = [
      { kind: "event", endpoint: `${base}/` },
      { kind: "definitions", endpoint: `${base}/stats/` },
      { kind: "players", endpoint: `${base}/stats/players/` },
      { kind: "opponents", endpoint: `${base}/stats/opponents/` },
      { kind: "report", endpoint: `${base}/report/` },
    ];
    for (const request of requests) {
      try {
        await capture(client, { eventId, ...request });
        manifest.samples.push({ categoryType, eventId, kind: request.kind, endpoint: `GET /v2.1/${request.endpoint}` });
      } catch (error) {
        manifest.errors.push({
          categoryType,
          eventId,
          kind: request.kind,
          status: error?.status ?? null,
          errorKind: error?.kind ?? "unexpected",
          message: error?.message ?? "Erreur inconnue",
        });
      }
    }
  }
  await writeJsonAtomically(
    fileURLToPath(new URL("event-statistics-samples-manifest.json", privateRoot)),
    manifest,
  );
  console.log("Échantillons de statistiques par type de match capturés (GET uniquement).");
  console.log(`- Réponses valides : ${manifest.samples.length}`);
  console.log(`- Réponses en erreur : ${manifest.errors.length}`);
  console.log(`- Types de matchs examinés : ${samples.size}`);
} catch (error) {
  if (error?.kind) printRequestError(error);
  else console.error(`Capture refusée : ${error.message}`);
  process.exitCode = 1;
}
