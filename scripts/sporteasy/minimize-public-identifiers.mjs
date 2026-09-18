import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import { buildPublicPlayerIdMap, publicMatchId, publicSeasonId } from "../../src/privacy/public-identifiers.mjs";

const root = new URL("../../", import.meta.url);
const playersRepository = JSON.parse(await readFile(new URL("data/private/sporteasy/players-repository.json", root), "utf8"));
const playerIds = buildPublicPlayerIdMap(playersRepository.players);

async function readAssignment(fileName, property) {
  const context = {window:{}};
  vm.createContext(context);
  vm.runInContext(await readFile(new URL(fileName, root), "utf8"), context, {filename:fileName});
  return structuredClone(context.window[property]);
}

const pantheon = await readAssignment("pantheon-data.js", "LYKOS_PANTHEON_STATS");
const secondary = await readAssignment("player-secondary-data.js", "LYKOS_SECONDARY_STATS");
const team = await readAssignment("team-data.js", "LYKOS_TEAM_STATS");
const seasonIds = new Map();
for (const scope of pantheon.recordScopes?.season ?? []) {
  seasonIds.set(String(scope.seasonId), publicSeasonId(scope.label));
}
if (pantheon.currentSeason?.seasonId && pantheon.currentSeason?.seasonLabel) {
  seasonIds.set(String(pantheon.currentSeason.seasonId), publicSeasonId(pantheon.currentSeason.seasonLabel));
}
for (const season of team.seasons ?? []) {
  seasonIds.set(String(season.id), publicSeasonId(season.label));
}
const eventIds = new Map();
for (const scope of pantheon.recordScopes?.match ?? []) {
  eventIds.set(String(scope.eventId), publicMatchId({date:scope.date, opponent:scope.opponentName}));
}
function collectTeamEvents(value) {
  if (Array.isArray(value)) return value.forEach(collectTeamEvents);
  if (!value || typeof value !== "object") return;
  if (value.eventId && value.date) {
    eventIds.set(String(value.eventId), publicMatchId({date:value.date, opponent:value.opponent}));
  }
  Object.values(value).forEach(collectTeamEvents);
}
collectTeamEvents(team);

const replacements = new Map([...playerIds, ...seasonIds, ...eventIds]);
const ordered = [...replacements.entries()].sort((left, right) => right[0].length - left[0].length);
async function replaceInFile(fileName) {
  const url = new URL(fileName, root);
  let text = await readFile(url, "utf8");
  for (const [sourceId, publicId] of ordered) {
    text = text.replaceAll(sourceId, publicId);
  }
  await writeFile(url, text, "utf8");
}

await Promise.all([
  "index.html",
  "player-secondary-data.js",
  "pantheon-data.js",
  "team-data.js",
].map(replaceInFile));

if (!team.generatedAt && secondary.generatedAt) {
  const teamUrl = new URL("team-data.js", root);
  let text = await readFile(teamUrl, "utf8");
  text = text.replace("window.LYKOS_TEAM_STATS = {", `window.LYKOS_TEAM_STATS = {\n  \"generatedAt\": ${JSON.stringify(secondary.generatedAt)},`);
  await writeFile(teamUrl, text, "utf8");
}

console.log(`Identifiants publics minimisés : ${playerIds.size} joueurs, ${seasonIds.size} saisons, ${eventIds.size} matchs.`);
