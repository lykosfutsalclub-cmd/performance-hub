import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { publicMatchId, publicPlayerId, publicSeasonId } from "../../src/privacy/public-identifiers.mjs";
import { assertPublicationQuality } from "./lib/publication-quality-gate.mjs";

const root = new URL("../../", import.meta.url);
const privateRoot = new URL("data/private/sporteasy/", root);
const defaultOutput = fileURLToPath(new URL("github-pages/pantheon-data.js", root));
const outputFile = process.argv[2] || defaultOutput;

const [matchRepository, playersRepository, seasonsPayload, matchAudit] = await Promise.all([
  "match-repository.json",
  "players-repository.json",
  "raw/statistics/seasons.json",
  "match-audit-report.json",
].map(async (name) => JSON.parse(await readFile(new URL(name, privateRoot), "utf8"))));

assertPublicationQuality({ matchAudit, primaryRepositories:[matchRepository, playersRepository] });

const playersBySourceId = new Map((playersRepository.players ?? []).map((player) => [
  String(player.sporteasyId),
  {name:player.displayName, publicId:publicPlayerId(player.displayName)},
]));
const seasonRows = seasonsPayload.results ?? seasonsPayload;
if (!Array.isArray(seasonRows)) throw new Error("La liste des saisons SportEasy est invalide.");
const seasonsBySourceId = new Map(seasonRows.map((season) => [String(season.id), {
  sourceId:String(season.id),
  label:season.name ?? season.slug_name ?? String(season.id),
  current:Boolean(season.current),
}]));

function finiteMetric(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function playerRow(row) {
  const sourceId = String(row.profileId ?? "");
  const player = playersBySourceId.get(sourceId);
  const playerName = player?.name ?? row.playerName ?? "Joueur";
  return {
    playerId:player?.publicId ?? publicPlayerId(playerName),
    playerName,
    matchesPlayed:1,
    goals:finiteMetric(row.metrics?.player_goals),
    assists:finiteMetric(row.metrics?.player_assists),
    manOfMatch:row.metrics?.man_of_event === true ? 1 : 0,
  };
}

function aggregateMatches(matches) {
  const result = new Map();
  for (const match of matches) {
    for (const row of match.playerStatistics ?? []) {
      const player = playerRow(row);
      const current = result.get(player.playerId) ?? {
        playerId:player.playerId,
        playerName:player.playerName,
        matchesPlayed:0,
        goals:null,
        assists:null,
        manOfMatch:0,
      };
      current.matchesPlayed += 1;
      if (player.goals !== null) current.goals = (current.goals ?? 0) + player.goals;
      if (player.assists !== null) current.assists = (current.assists ?? 0) + player.assists;
      current.manOfMatch += player.manOfMatch;
      result.set(player.playerId, current);
    }
  }
  return Object.fromEntries([...result.entries()].sort(([left], [right]) => left.localeCompare(right, "fr")));
}

const completedMatches = (matchRepository.matches ?? [])
  .filter((match) => match.status?.hasCompleteScore
    && !match.status?.isCancelled
    && !match.tournamentContainerId
    && (match.playerStatistics?.length ?? 0) > 0)
  .sort((left, right) => String(left.day).localeCompare(String(right.day)) || String(left.eventId).localeCompare(String(right.eventId)));

const bySeason = new Map();
const byMonth = new Map();
for (const match of completedMatches) {
  const seasonSourceId = String(match.seasonId);
  if (!bySeason.has(seasonSourceId)) bySeason.set(seasonSourceId, []);
  bySeason.get(seasonSourceId).push(match);
  const monthKey = String(match.day).slice(0, 7);
  const compound = `${seasonSourceId}:${monthKey}`;
  if (!byMonth.has(compound)) byMonth.set(compound, []);
  byMonth.get(compound).push(match);
}

const seasonScopes = [...bySeason.entries()].map(([sourceId, matches]) => {
  const season = seasonsBySourceId.get(sourceId) ?? {label:sourceId};
  const publicId = publicSeasonId(season.label);
  return {
    key:publicId,
    seasonId:publicId,
    label:season.label,
    startDate:`${String(season.label).slice(0, 4)}-08-01`,
    players:aggregateMatches(matches),
  };
});

const monthScopes = [...byMonth.entries()].map(([compound, matches]) => {
  const [sourceId, monthKey] = compound.split(":");
  const season = seasonsBySourceId.get(sourceId) ?? {label:sourceId};
  const seasonId = publicSeasonId(season.label);
  return {
    key:`${seasonId}:${monthKey}`,
    seasonId,
    monthKey,
    label:monthKey,
    date:`${monthKey}-01`,
    players:aggregateMatches(matches),
  };
});

const matchScopes = completedMatches.map((match) => {
  const season = seasonsBySourceId.get(String(match.seasonId)) ?? {label:String(match.seasonId)};
  const eventId = publicMatchId({date:match.day, opponent:match.opponent?.name});
  return {
    key:eventId,
    eventId,
    seasonId:publicSeasonId(season.label),
    date:match.day,
    opponentName:match.opponent?.name ?? "Adversaire",
    label:match.day,
    players:aggregateMatches([match]),
  };
});

const currentSeason = seasonRows.find((season) => season.current === true);
if (!currentSeason) throw new Error("La saison actuelle est introuvable.");
const currentLabel = currentSeason.name ?? currentSeason.slug_name ?? String(currentSeason.id);
const startYear = Number(String(currentLabel).slice(0, 4));
const currentMatches = bySeason.get(String(currentSeason.id)) ?? [];
const months = {};
for (const monthNumber of [8,9,10,11,12,1,2,3,4,5,6]) {
  const year = monthNumber >= 8 ? startYear : startYear + 1;
  const monthKey = `${year}-${String(monthNumber).padStart(2, "0")}`;
  const matches = currentMatches.filter((match) => String(match.day).startsWith(monthKey));
  months[monthKey] = {
    key:monthKey,
    label:new Intl.DateTimeFormat("fr-FR", {month:"long", year:"numeric", timeZone:"Europe/Paris"}).format(new Date(`${monthKey}-01T12:00:00Z`)),
    year,
    month:monthNumber,
    matchCount:matches.length,
    players:aggregateMatches(matches),
  };
  months[monthKey].label = months[monthKey].label.charAt(0).toLocaleUpperCase("fr") + months[monthKey].label.slice(1);
}

const payload = {
  generatedAt:matchRepository.metadata?.syncedAt ?? new Date().toISOString(),
  currentSeason:{
    seasonId:publicSeasonId(currentLabel),
    seasonLabel:currentLabel,
    startYear,
    months,
  },
  recordScopes:{season:seasonScopes, month:monthScopes, match:matchScopes},
};

await writeFile(outputFile, `window.LYKOS_PANTHEON_STATS = ${JSON.stringify(payload)};\n`, "utf8");
console.log(`Panthéon public reconstruit : ${completedMatches.length} matchs avec statistiques individuelles.`);
