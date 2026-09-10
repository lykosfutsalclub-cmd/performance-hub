import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { inspectJson } from "./lib/schema-inspector.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const rawDirectory = new URL("raw/statistics/aggregate/", privateRoot);
const schemaDirectory = new URL("schema/statistics/aggregate/", privateRoot);

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

function list(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.results)) return payload.results;
  throw new Error(`${label} n'est pas une liste exploitable.`);
}

async function readSeasons() {
  const path = fileURLToPath(new URL("raw/statistics/seasons.json", privateRoot));
  return list(JSON.parse(await readFile(path, "utf8")), "La capture des saisons");
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
  const seasons = await readSeasons();
  const targets = seasons.map((season) => ({
    scope: "season",
    seasonId: positiveId(season?.id, "Identifiant de saison"),
    seasonSlug: safeSlug(season?.slug_name, "Nom technique de saison"),
  }));
  targets.push({ scope: "allTime", seasonId: null, seasonSlug: "all" });

  const manifest = {
    source: "SportEasy",
    capturedAt: new Date().toISOString(),
    validationStatus: "pending",
    requests: [],
    errors: [],
  };

  for (const target of targets) {
    for (const kind of ["global", "players"]) {
      const endpoint =
        `teams/${configuration.teamId}/stats/all/${kind}/?` +
        new URLSearchParams({ season_slug_name: target.seasonSlug });
      const resource = target.scope === "allTime"
        ? `all-${kind}`
        : `season-${target.seasonId}-${kind}`;
      try {
        const payload = await capture(client, { resource, endpoint });
        manifest.requests.push({
          ...target,
          kind,
          resource,
          endpoint: `GET /v2.1/${endpoint}`,
          rootType: Array.isArray(payload) ? "array" : typeof payload,
        });
      } catch (error) {
        manifest.errors.push({
          ...target,
          kind,
          resource,
          endpoint: `GET /v2.1/${endpoint}`,
          errorKind: error?.kind ?? "unexpected",
          status: error?.status ?? null,
          message: error?.message ?? "Erreur inconnue",
        });
      }
    }
  }

  const expectedRequestCount = targets.length * 2;
  if (manifest.errors.length || manifest.requests.length !== expectedRequestCount) {
    throw new Error(
      `Capture agrégée incomplète : ${manifest.requests.length}/${expectedRequestCount} réponses valides.`,
    );
  }
  manifest.validationStatus = "valid";
  await writeJsonAtomically(
    fileURLToPath(new URL("statistics-aggregate-manifest.json", privateRoot)),
    manifest,
  );

  console.log("Capture des vues officielles « Tous les matchs » terminée (GET uniquement).");
  console.log(`- Réponses valides : ${manifest.requests.length}`);
  console.log("- Périodes : chaque saison disponible + All-time");
  console.log("- Manifeste privé : data/private/sporteasy/statistics-aggregate-manifest.json");
} catch (error) {
  if (error?.kind) printRequestError(error);
  else console.error(`Capture refusée : ${error.message}`);
  process.exitCode = 1;
}
