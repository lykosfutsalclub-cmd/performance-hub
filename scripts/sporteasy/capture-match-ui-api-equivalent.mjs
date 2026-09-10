import { fileURLToPath } from "node:url";
import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { buildApiEquivalentMatchCapture } from "./lib/match-ui-api-capture.mjs";

const eventId = String(process.argv[2] ?? "").trim();
if (!/^[1-9]\d*$/.test(eventId)) throw new Error("Usage : fournir un identifiant de match SportEasy.");

try {
  const configuration = readConfiguration();
  const client = new ReadonlySportEasyClient(configuration);
  const base = `teams/${configuration.teamId}/events/${eventId}`;
  const [event, statistics, report] = await Promise.all([
    client.getJson(`${base}/`, { version: "2.1" }),
    client.getJson(`${base}/stats/`, { version: "2.1" }),
    client.getJson(`${base}/report/`, { version: "2.1" }),
  ]);
  const capture = buildApiEquivalentMatchCapture({
    event,
    statistics,
    report,
    capturedAt: new Date().toISOString(),
  });
  const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
  const output = fileURLToPath(new URL(`raw/match-ui/event-${eventId}.json`, privateRoot));
  await writeJsonAtomically(output, capture);
  console.log("Capture SportEasy équivalente terminée (GET uniquement).");
  console.log(`- Match : ${eventId}`);
  console.log(`- Présences : ${capture.evidence.attendanceCount}`);
  console.log(`- Statistiques joueurs : ${capture.evidence.playerStatisticsCount}`);
  console.log(`- Compte rendu renseigné : ${capture.evidence.reportPresent ? "oui" : "non"}`);
} catch (error) {
  if (error?.kind) printRequestError(error);
  else console.error(`Capture refusée : ${error.message}`);
  process.exitCode = 1;
}
