import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonAtomically } from "./lib/atomic-json.mjs";
import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { synchronizePlayerRepository } from "./lib/players-sync-service.mjs";
import { getResource } from "./lib/resources.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const repositoryFile = fileURLToPath(
  new URL("../../data/private/sporteasy/players-repository.json", import.meta.url),
);

function requestFor(resourceName, configuration) {
  const resource = getResource(resourceName);
  if (!resource?.enabled) {
    throw new Error(`Ressource interne indisponible : ${resourceName}.`);
  }
  return {
    endpoint: resource.buildEndpoint(configuration),
    version: resource.version,
  };
}

async function readPreviousRepository() {
  try {
    return JSON.parse(await readFile(repositoryFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

try {
  const configuration = readConfiguration();
  const client = new ReadonlySportEasyClient(configuration);
  const seasonsRequest = requestFor("seasons", configuration);
  const currentProfilesRequest = requestFor("profiles", configuration);
  const archivedProfilesRequest = requestFor("archivedProfiles", configuration);
  const previousRepository = await readPreviousRepository();

  const repository = await synchronizePlayerRepository({
    client,
    seasonsRequest,
    currentProfilesRequest,
    archivedProfilesRequest,
    previousRepository,
    publish: (data) => writeJsonAtomically(repositoryFile, data),
  });

  console.log("Synchronisation des joueurs SportEasy validée");
  console.log(`- Joueurs actuels : ${repository.metadata.currentPlayerCount}`);
  console.log(`- Joueurs actuels auparavant : ${repository.metadata.previousCurrentPlayerCount}`);
  console.log(`- Anciens joueurs : ${repository.metadata.formerPlayerCount}`);
  console.log(`- Total historique : ${repository.metadata.historicalPlayerCount}`);
  console.log(`- Saisons disponibles : ${repository.metadata.seasonsAvailable.length}`);
  console.log(`- IDs ajoutés à l'effectif : ${repository.metadata.addedCurrentIds.join(", ") || "aucun"}`);
  console.log(`- IDs retirés de l'effectif : ${repository.metadata.removedCurrentIds.join(", ") || "aucun"}`);
  console.log("- Saisons précises des anciens : non fournies par SportEasy");
  console.log(`- Fichier privé : ${relative(projectRoot, repositoryFile)}`);
  console.log("- L'ancienne version validée n'est remplacée qu'après tous les contrôles.");
} catch (error) {
  if (error?.kind === "validation") {
    console.error("Synchronisation des joueurs refusée par les contrôles de cohérence.");
    console.error(`- Message : ${error.message}`);
  } else {
    printRequestError(error);
  }
  console.error("- La dernière version locale validée, si elle existe, a été conservée.");
  process.exitCode = 1;
}
