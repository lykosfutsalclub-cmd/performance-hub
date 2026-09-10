import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { inspectJson } from "./lib/schema-inspector.mjs";

const rawDirectory = new URL("../../data/private/sporteasy/raw/statistics/", import.meta.url);
const schemaDirectory = new URL("../../data/private/sporteasy/schema/statistics/", import.meta.url);

function positiveId(value, label) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) throw new Error(`${label} invalide dans la réponse SportEasy.`);
  return text;
}

function collectionItems(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.results)) {
    return payload.results;
  }
  throw new Error(`${label} n'est pas une liste SportEasy exploitable.`);
}

async function capture({ client, resource, endpoint, version }) {
  const capturedAt = new Date().toISOString();
  const payload = await client.getJson(endpoint, { version });
  const fileName = `${resource}.json`;
  await Promise.all([
    writeJsonAtomically(fileURLToPath(new URL(fileName, rawDirectory)), payload),
    writeJsonAtomically(
      fileURLToPath(new URL(fileName, schemaDirectory)),
      inspectJson(payload, { resource, endpoint: `/v${version}/${endpoint}`, capturedAt }),
    ),
  ]);
  return payload;
}

try {
  const configuration = readConfiguration();
  const client = new ReadonlySportEasyClient(configuration);
  const seasonsEndpoint = `teams/${configuration.teamId}/seasons/`;
  const seasonsPayload = await capture({
    client,
    resource: "seasons",
    endpoint: seasonsEndpoint,
    version: "2.1",
  });
  const seasons = collectionItems(seasonsPayload, "La réponse des saisons");
  if (seasons.length === 0) throw new Error("SportEasy ne renvoie aucune saison.");

  const summary = [];
  for (const season of seasons) {
    const seasonId = positiveId(season?.id, "Identifiant de saison");
    const categoriesEndpoint =
      `teams/${configuration.teamId}/categories/?` + new URLSearchParams({ season_id: seasonId });
    const eventsEndpoint =
      `teams/${configuration.teamId}/events/?` +
      new URLSearchParams({ season_id: seasonId, web: "1" });

    const [categoriesPayload, eventsPayload] = await Promise.all([
      capture({
        client,
        resource: `season-${seasonId}-categories`,
        endpoint: categoriesEndpoint,
        version: "2.3",
      }),
      capture({
        client,
        resource: `season-${seasonId}-events`,
        endpoint: eventsEndpoint,
        version: "2.1",
      }),
    ]);

    summary.push({
      seasonId,
      name: typeof season?.name === "string" ? season.name : null,
      current: season?.current === true,
      categoryCount: collectionItems(categoriesPayload, "La réponse des catégories").length,
      eventCount: collectionItems(eventsPayload, "La réponse des événements").length,
    });
  }

  console.log("Capture des sources statistiques SportEasy terminée (GET uniquement).");
  for (const season of summary) {
    console.log(
      `- ${season.name ?? season.seasonId}${season.current ? " (actuelle)" : ""} : ` +
        `${season.categoryCount} catégorie(s), ${season.eventCount} événement(s)`,
    );
  }
  console.log("- Réponses privées : data/private/sporteasy/raw/statistics/");
  console.log("- Schémas sans copie complète : data/private/sporteasy/schema/statistics/");
} catch (error) {
  if (error?.kind) printRequestError(error);
  else console.error(`Capture refusée : ${error.message}`);
  process.exitCode = 1;
}
