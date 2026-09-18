import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildTeamDashboardPeriod, sanitizeTeamMatches, validateTeamDashboardPeriod } from "./lib/team-dashboard-data.mjs";
import { buildSeasonTeamSeries, summarizeTeamForm, TEAM_FORM_METHOD } from "../../src/team/team-form.mjs";
import { assertPublicationQuality } from "./lib/publication-quality-gate.mjs";
import { publicMatchId, publicSeasonId } from "../../src/privacy/public-identifiers.mjs";

const projectRoot = new URL("../../", import.meta.url);
const aggregateRoot = new URL("data/private/sporteasy/raw/statistics/aggregate/", projectRoot);
const matchRepositoryFile = new URL("data/private/sporteasy/match-repository.json", projectRoot);
const seasonsFile = new URL("data/private/sporteasy/raw/statistics/seasons.json", projectRoot);
const matchAuditFile = new URL("data/private/sporteasy/match-audit-report.json", projectRoot);
const outputFile = fileURLToPath(new URL("github-pages/team-data.js", projectRoot));

async function readCharts(fileName) {
  const payload = JSON.parse(await readFile(new URL(fileName, aggregateRoot), "utf8"));
  return payload.charts_data ?? {};
}

const [matchRepository, seasonsPayload, matchAudit] = await Promise.all([
  matchRepositoryFile,
  seasonsFile,
  matchAuditFile,
].map(async (file) => JSON.parse(await readFile(file, "utf8"))));
assertPublicationQuality({ matchAudit });
const completedMatches = (matchRepository.matches ?? []).filter((match) =>
  match.status?.hasCompleteScore
  && Number.isFinite(match.score?.team)
  && Number.isFinite(match.score?.opponent),
);
const validMatches = sanitizeTeamMatches(completedMatches);
const seasonRows = seasonsPayload.results ?? seasonsPayload;
if (!Array.isArray(seasonRows)) throw new Error("La liste des saisons SportEasy est invalide.");
const currentSeason = seasonRows.find((season) => season.current === true);
if (!currentSeason?.id) throw new Error("La saison SportEasy actuelle est introuvable.");
const previousSeason = seasonRows
  .filter((season) => String(season.id) !== String(currentSeason.id))
  .sort((left, right) => Number(right.id) - Number(left.id))[0];
if (!previousSeason?.id) throw new Error("La saison SportEasy précédente est introuvable.");
const currentSeasonId = String(currentSeason.id);
const previousSeasonId = String(previousSeason.id);

const periods = {
  current: buildTeamDashboardPeriod(await readCharts(`season-${currentSeasonId}-global.json`), validMatches.filter((match) => match.seasonId === currentSeasonId)),
  previous: buildTeamDashboardPeriod(await readCharts(`season-${previousSeasonId}-global.json`), validMatches.filter((match) => match.seasonId === previousSeasonId)),
  alltime: buildTeamDashboardPeriod(await readCharts("all-global.json"), validMatches),
};

const seasons = seasonRows.map((season) => {
  const matches = validMatches.filter((match) => match.seasonId === String(season.id));
  const series = buildSeasonTeamSeries(matches, validMatches);
  return {
    id: String(season.id),
    label: season.name ?? season.slug_name ?? String(season.id),
    current: Boolean(season.current),
    matchCount: series.length,
    series,
    form: summarizeTeamForm(series),
  };
});
periods.current.form = seasons.find((season) => season.current)?.form ?? summarizeTeamForm([]);
periods.previous.form = seasons.find((season) => season.id === previousSeasonId)?.form ?? summarizeTeamForm([]);
const alltimeSeries = buildSeasonTeamSeries(validMatches, validMatches);
periods.alltime.form = summarizeTeamForm(alltimeSeries);
const method = {
  ...TEAM_FORM_METHOD,
  eventRatingSourceAvailable: validMatches.some((match) => {
    const eventRatingAverage = Number(match.eventRating?.average);
    return Number.isFinite(eventRatingAverage) && eventRatingAverage >= 1 && eventRatingAverage <= 6;
  }),
};

Object.entries(periods).forEach(([label, period]) => validateTeamDashboardPeriod(period, label));

const eventIds = new Map(validMatches.map((match) => [String(match.eventId), publicMatchId({
  date:match.day,
  opponent:match.opponent?.name,
})]));
const seasonIds = new Map(seasonRows.map((season) => [
  String(season.id),
  publicSeasonId(season.name ?? season.slug_name ?? String(season.id)),
]));
function replaceTechnicalIdentifiers(value) {
  if (Array.isArray(value)) return value.map(replaceTechnicalIdentifiers);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTechnicalIdentifiers(item)]));
  }
  if (typeof value !== "string") return value;
  return eventIds.get(value) ?? seasonIds.get(value) ?? value;
}
const publicPayload = replaceTechnicalIdentifiers({
  generatedAt:matchRepository.metadata?.syncedAt ?? new Date().toISOString(),
  periods,
  seasons,
  method,
});
const output = `window.LYKOS_TEAM_STATS = ${JSON.stringify(publicPayload, null, 2)};\n`;
await writeFile(outputFile, output, "utf8");
console.log("Données publiques des statistiques équipe générées dans github-pages/team-data.js.");
