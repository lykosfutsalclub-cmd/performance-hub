import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { buildPlayerSecondaryRepository } from "../../src/statistics/player-secondary-analytics.mjs";
import { syncMetronDocumentation } from "../../src/performance/metron-documentation.mjs";

const privateRoot = new URL("../../data/private/sporteasy/", import.meta.url);
const outputFile = fileURLToPath(new URL("player-secondary-statistics.json", privateRoot));

async function readPrivate(name) {
  return JSON.parse(await readFile(fileURLToPath(new URL(name, privateRoot)), "utf8"));
}

try {
  const [matchRepository, statisticsRepository, playersRepository, playerEssentialsRepository, verifiedPlayedCancelledMatches, officialPlayerAwards] = await Promise.all([
    readPrivate("match-repository.json"),
    readPrivate("statistics-repository.json"),
    readPrivate("players-repository.json"),
    readPrivate("current-player-essentials.json"),
    readPrivate("verified-played-cancelled-matches.json"),
    readPrivate("official-player-awards.json"),
  ]);
  const repository = buildPlayerSecondaryRepository({
    matchRepository,
    statisticsRepository,
    playersRepository,
    playerEssentialsRepository,
    verifiedPlayedCancelledMatches,
    officialPlayerAwards,
  });
  if (repository.metadata.validationStatus !== "valid") {
    throw new Error(`${repository.metadata.errorCount} incohérence(s) bloquante(s) détectée(s).`);
  }
  await writeJsonAtomically(outputFile, repository);
  if (process.env.ESTAFF_SKIP_METRON_DOCS !== "1") {
    await syncMetronDocumentation([
      fileURLToPath(new URL("../../github-pages/index.html", import.meta.url)),
      fileURLToPath(new URL("../../sites-app/public/lykos-dashboard-preview.html", import.meta.url)),
    ]);
  }
  console.log("Statistiques secondaires joueurs calculées et validées.");
  console.log(`- Joueurs : ${playersRepository.players.length}`);
  console.log(`- Périodes : ${Object.keys(repository.periods).length}`);
  console.log(`- Erreurs : ${repository.metadata.errorCount}`);
  console.log(`- Avertissements traçables : ${repository.metadata.warningCount}`);
  console.log("- Fichier privé : data/private/sporteasy/player-secondary-statistics.json");
} catch (error) {
  console.error("Publication des statistiques secondaires refusée.");
  console.error(`- Message : ${error.message}`);
  process.exitCode = 1;
}
