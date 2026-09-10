import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { assertPublicationQuality } from "./lib/publication-quality-gate.mjs";

const root = new URL("../../", import.meta.url);
const privateRoot = new URL("data/private/sporteasy/", root);
const sourceFile = fileURLToPath(new URL("player-secondary-statistics.json", privateRoot));
const matchAuditFile = fileURLToPath(new URL("match-audit-report.json", privateRoot));
const secondaryAuditFile = fileURLToPath(new URL("player-secondary-audit-report.json", privateRoot));
const primaryFiles = ["players-repository.json", "statistics-repository.json", "match-repository.json"]
  .map((name) => fileURLToPath(new URL(name, privateRoot)));
const outputs = [
  fileURLToPath(new URL("github-pages/player-secondary-data.js", root)),
  fileURLToPath(new URL("sites-app/public/player-secondary-data.js", root)),
];

function publicPartner(partner) {
  if (!partner) return null;
  return {
    playerId: partner.playerId,
    playerName: partner.playerName,
    matchesTogether: partner.matchesTogether,
    winsTogether: partner.winsTogether,
    drawsTogether: partner.drawsTogether,
    lossesTogether: partner.lossesTogether,
    winRate: partner.winRate,
    lossRate: partner.lossRate,
    playerContributionsPerGame: partner.playerContributionsPerGame,
  };
}

function publicAnalytics(analytics) {
  return {
    primary: analytics.primary,
    creation: analytics.creation,
    finishing: analytics.finishing,
    offensive: analytics.offensive,
    defensive: analytics.defensive,
    collective: {
      bestWinningPartner: publicPartner(analytics.collective.bestWinningPartner),
      worstLosingPartner: publicPartner(analytics.collective.worstLosingPartner),
      bestOffensivePartner: publicPartner(analytics.collective.bestOffensivePartner),
      worstOffensivePartner: publicPartner(analytics.collective.worstOffensivePartner),
      favoriteLineup: analytics.collective.favoriteLineup,
      favoriteLineupCandidateCount: analytics.collective.favoriteLineupCandidateCount,
      favoriteLineupComplete: analytics.collective.favoriteLineupComplete,
      favoriteLineupFallbackCount: analytics.collective.favoriteLineupFallbackCount,
      averageMatchesTogether: analytics.collective.averageMatchesTogether,
      favoriteLineupAverageMatches: analytics.collective.favoriteLineupAverageMatches,
      favoriteLineupMinimumMatches: analytics.collective.favoriteLineupMinimumMatches,
      minimumMatchesTogether: analytics.collective.minimumMatchesTogether,
      sampleRule: analytics.collective.sampleRule,
    },
    rankings: analytics.rankings,
    performance: analytics.performance,
  };
}

const [repository, matchAudit, secondaryAudit, ...primaryRepositories] = await Promise.all([
  sourceFile,
  matchAuditFile,
  secondaryAuditFile,
  ...primaryFiles,
].map(async (file) => JSON.parse(await readFile(file, "utf8"))));
assertPublicationQuality({ matchAudit, secondaryAudit, secondaryRepository: repository, primaryRepositories });

const payload = {
  generatedAt: repository.metadata.generatedAt,
  formulaVersion: repository.metadata.formulaVersion,
  ratingSystem: repository.metadata.ratingSystem,
  calendarYearAwards: repository.calendarYearAwards,
  primeByPlayer: repository.primeByPlayer,
  periods: Object.fromEntries(Object.entries(repository.periods).map(([periodKey, period]) => [
    periodKey,
    {
      matchCount: period.matchCount,
      matchesWithCompleteScore: period.matchesWithCompleteScore,
      players: Object.fromEntries(Object.entries(period.players).map(([playerId, analytics]) => [
        playerId,
        publicAnalytics(analytics),
      ])),
    },
  ])),
};

const javascript = `window.LYKOS_SECONDARY_STATS = ${JSON.stringify(payload)};\n`;
await Promise.all(outputs.map((output) => writeFile(output, javascript, "utf8")));
console.log("Statistiques secondaires publiques générées sans données de traçage privées.");
console.log(`- Taille : ${Buffer.byteLength(javascript)} octets`);
console.log("- Cibles : github-pages et application Sites");
