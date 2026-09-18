import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../../", import.meta.url);
const privateRoot = new URL("data/private/sporteasy/", root);
const [players, matches, seasonsPayload] = await Promise.all([
  "players-repository.json",
  "match-repository.json",
  "raw/statistics/seasons.json",
].map(async (name) => JSON.parse(await readFile(new URL(name, privateRoot), "utf8"))));
const publicFiles = [
  "index.html",
  "github-pages/player-secondary-data.js",
  "github-pages/team-data.js",
  "github-pages/pantheon-data.js",
];
const texts = await Promise.all(publicFiles.map(async (name) => [name, await readFile(new URL(name, root), "utf8")]));
const technicalIds = new Set([
  ...(players.players ?? []).map((player) => String(player.sporteasyId)),
  ...(matches.matches ?? []).flatMap((match) => [String(match.eventId), String(match.seasonId)]),
  ...((seasonsPayload.results ?? seasonsPayload) || []).map((season) => String(season.id)),
].filter(Boolean));
const failures = [];
for (const [name, text] of texts) {
  for (const id of technicalIds) {
    if (text.includes(`"${id}"`)) failures.push(`${name}: identifiant technique externe encore présent`);
  }
}
const index = texts.find(([name]) => name === "index.html")[1];
if (/birthDate:\s*"\d{2}\/\d{2}\/\d{4}"/.test(index)) failures.push("index.html: date de naissance complète encore présente");

async function assignment(fileName, property) {
  const context = {window:{}};
  vm.createContext(context);
  vm.runInContext(await readFile(new URL(fileName, root), "utf8"), context, {filename:fileName});
  return context.window[property];
}
const [secondary, team, pantheon] = await Promise.all([
  assignment("github-pages/player-secondary-data.js", "LYKOS_SECONDARY_STATS"),
  assignment("github-pages/team-data.js", "LYKOS_TEAM_STATS"),
  assignment("github-pages/pantheon-data.js", "LYKOS_PANTHEON_STATS"),
]);
for (const [label, payload] of [["joueurs", secondary], ["équipe", team], ["Panthéon", pantheon]]) {
  if (Number.isNaN(Date.parse(payload?.generatedAt))) failures.push(`${label}: date de génération absente ou invalide`);
}
if (team.generatedAt !== matches.metadata?.syncedAt) failures.push("équipe: date différente de la source des matchs");
if (pantheon.generatedAt !== matches.metadata?.syncedAt) failures.push("Panthéon: date différente de la source des matchs");
const currentSeason = (seasonsPayload.results ?? seasonsPayload).find((season) => season.current === true);
const expectedCurrentMatches = (matches.matches ?? []).filter((match) => String(match.seasonId) === String(currentSeason?.id)
  && match.status?.hasCompleteScore && !match.status?.isCancelled && !match.tournamentContainerId
  && (match.playerStatistics?.length ?? 0) > 0).length;
const publishedCurrentMatches = Object.values(pantheon.currentSeason?.months ?? {}).reduce((total, month) => total + Number(month.matchCount || 0), 0);
if (publishedCurrentMatches !== expectedCurrentMatches) failures.push(`Panthéon: ${publishedCurrentMatches} matchs publiés au lieu de ${expectedCurrentMatches}`);

if (failures.length) {
  throw new Error(`Audit des données publiques refusé :\n- ${[...new Set(failures)].join("\n- ")}`);
}
console.log("Audit public réussi : dates présentes, Panthéon réconcilié et identifiants externes absents.");
