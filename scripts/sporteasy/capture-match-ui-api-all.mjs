import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { buildApiEquivalentMatchCapture } from "./lib/match-ui-api-capture.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const outputDirectory = new URL("raw/match-ui/", privateRoot);

async function readPrivate(relativePath) {
  return JSON.parse(await readFile(fileURLToPath(new URL(relativePath, privateRoot)), "utf8"));
}

try {
  const configuration = readConfiguration();
  const client = new ReadonlySportEasyClient(configuration);
  const manifest = await readPrivate("event-statistics-manifest.json");
  if (manifest?.validationStatus !== "valid" || !Array.isArray(manifest.events)) {
    throw new Error("Le manifeste des matchs n’est pas valide.");
  }

  const pending = [...manifest.events];
  const result = { expected: pending.length, captured: 0, errors: [] };

  async function worker() {
    while (pending.length) {
      const item = pending.shift();
      const eventId = String(item.eventId);
      try {
        const [event, statistics, report] = await Promise.all([
          client.getJson(`teams/${configuration.teamId}/events/${eventId}/`, { version: "2.1" }),
          readPrivate(`raw/statistics/events/event-${eventId}.json`),
          client.getJson(`teams/${configuration.teamId}/events/${eventId}/report/`, { version: "2.1" }),
        ]);
        const capture = buildApiEquivalentMatchCapture({
          event,
          statistics,
          report,
          capturedAt: new Date().toISOString(),
        });
        await writeJsonAtomically(
          fileURLToPath(new URL(`event-${eventId}.json`, outputDirectory)),
          capture,
        );
        result.captured += 1;
      } catch (error) {
        result.errors.push({
          eventId,
          status: error?.status ?? null,
          kind: error?.kind ?? "unexpected",
          message: error?.message ?? "Erreur inconnue",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: 5 }, () => worker()));
  console.log("Actualisation complète des présences et comptes rendus terminée (GET uniquement).");
  console.log(`- Matchs attendus : ${result.expected}`);
  console.log(`- Matchs actualisés : ${result.captured}`);
  console.log(`- Erreurs : ${result.errors.length}`);
  if (result.errors.length) {
    for (const error of result.errors.slice(0, 5)) {
      console.log(`- ${error.eventId} : ${error.kind}${error.status ? ` ${error.status}` : ""} — ${error.message}`);
    }
    throw new Error(`Actualisation incomplète : ${result.captured}/${result.expected}.`);
  }
} catch (error) {
  if (error?.kind) printRequestError(error);
  else console.error(`Capture refusée : ${error.message}`);
  process.exitCode = 1;
}
