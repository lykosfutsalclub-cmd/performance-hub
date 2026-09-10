import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { inspectJson } from "./lib/schema-inspector.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const rawDirectory = new URL("raw/statistics/details/", privateRoot);
const schemaDirectory = new URL("schema/statistics/details/", privateRoot);
const matchCategoryTypes = new Set([
  "championship_match",
  "cup_match",
  "friendly_match",
]);

function positiveId(value, label) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) throw new Error(`${label} invalide.`);
  return text;
}

function safeSlug(value, label) {
  const text = String(value ?? "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) throw new Error(`${label} invalide.`);
  return text;
}

async function readPrivateJson(relativePath) {
  return JSON.parse(await readFile(fileURLToPath(new URL(relativePath, privateRoot)), "utf8"));
}

function items(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.results)) return payload.results;
  throw new Error(`${label} n'est pas une liste exploitable.`);
}

async function capture(client, { resource, endpoint }) {
  const payload = await client.getJson(endpoint, { version: "2.1" });
  const capturedAt = new Date().toISOString();
  const fileName = `${resource}.json`;
  await Promise.all([
    writeJsonAtomically(fileURLToPath(new URL(fileName, rawDirectory)), payload),
    writeJsonAtomically(
      fileURLToPath(new URL(fileName, schemaDirectory)),
      inspectJson(payload, { resource, endpoint: `/v2.1/${endpoint}`, capturedAt }),
    ),
  ]);
  return payload;
}

try {
  const configuration = readConfiguration();
  const client = new ReadonlySportEasyClient(configuration);
  const seasonsPayload = await readPrivateJson("raw/statistics/seasons.json");
  const seasons = items(seasonsPayload, "La capture des saisons");
  const manifest = {
    source: "SportEasy",
    capturedAt: new Date().toISOString(),
    requests: [],
    errors: [],
  };

  for (const season of seasons) {
    const seasonId = positiveId(season?.id, "Identifiant de saison");
    const seasonSlug = safeSlug(season?.slug_name, "Nom technique de saison");
    const categoriesPayload = await readPrivateJson(
      `raw/statistics/season-${seasonId}-categories.json`,
    );
    const categories = items(categoriesPayload, `Les catégories de la saison ${seasonId}`).filter(
      (category) => matchCategoryTypes.has(category?.type) && Number(category?.all_games) > 0,
    );

    for (const category of categories) {
      const categoryId = positiveId(category?.id, "Identifiant de catégorie saisonnière");
      const base = `teams/${configuration.teamId}/stats/${categoryId}`;
      const requests = [
        {
          kind: "global",
          endpoint:
            `${base}/global/?` + new URLSearchParams({ season_slug_name: seasonSlug }),
        },
        {
          kind: "players",
          endpoint:
            `${base}/players/?` + new URLSearchParams({ season_slug_name: seasonSlug }),
        },
        { kind: "rankings", endpoint: `${base}/rankings/` },
      ];

      for (const request of requests) {
        const resource = `season-${seasonId}-category-${categoryId}-${request.kind}`;
        try {
          const payload = await capture(client, { resource, endpoint: request.endpoint });
          manifest.requests.push({
            seasonId,
            categoryId,
            categoryType: category.type,
            categoryLabel: category.localized_name ?? null,
            kind: request.kind,
            endpoint: `GET /v2.1/${request.endpoint}`,
            rootType: Array.isArray(payload) ? "array" : typeof payload,
          });
        } catch (error) {
          manifest.errors.push({
            seasonId,
            categoryId,
            kind: request.kind,
            endpoint: `GET /v2.1/${request.endpoint}`,
            errorKind: error?.kind ?? "unexpected",
            status: error?.status ?? null,
            message: error?.message ?? "Erreur inconnue",
          });
        }
      }
    }
  }

  if (manifest.requests.length === 0) {
    throw new Error("Aucun endpoint statistique SportEasy n'a répondu correctement.");
  }
  await writeJsonAtomically(
    fileURLToPath(new URL("statistics-capture-manifest.json", privateRoot)),
    manifest,
  );

  console.log("Capture détaillée des statistiques terminée (GET uniquement).");
  console.log(`- Réponses valides : ${manifest.requests.length}`);
  console.log(`- Réponses en erreur : ${manifest.errors.length}`);
  console.log("- Manifeste privé : data/private/sporteasy/statistics-capture-manifest.json");
  if (manifest.errors.length) {
    const counts = Object.groupBy(manifest.errors, (error) => `${error.errorKind}:${error.status}`);
    for (const [key, errors] of Object.entries(counts)) {
      console.log(`- Erreurs ${key} : ${errors.length}`);
    }
  }
} catch (error) {
  if (error?.kind) printRequestError(error);
  else console.error(`Capture refusée : ${error.message}`);
  process.exitCode = 1;
}
