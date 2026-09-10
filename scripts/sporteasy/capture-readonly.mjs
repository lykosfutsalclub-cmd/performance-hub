import { mkdir, rename, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { getResource, printResourceList } from "./lib/resources.mjs";
import { inspectJson } from "./lib/schema-inspector.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const rawDirectory = fileURLToPath(new URL("../../data/private/sporteasy/raw/", import.meta.url));
const schemaDirectory = fileURLToPath(new URL("../../data/private/sporteasy/schema/", import.meta.url));

async function writeJsonAtomically(file, data) {
  const temporaryFile = `${file}.${process.pid}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryFile, file);
}

function failUsage(message) {
  console.error(message);
  console.error("Usage : npm run sporteasy:capture -- <ressource>");
  console.error("Liste : npm run sporteasy:capture -- --list");
  process.exitCode = 1;
}

const argumentsList = process.argv.slice(2).filter((argument) => argument !== "--");

if (argumentsList.length !== 1) {
  failUsage("Une seule ressource de la liste blanche est obligatoire.");
} else if (argumentsList[0] === "--list") {
  printResourceList();
} else {
  const resourceName = argumentsList[0];
  const resource = getResource(resourceName);

  if (!resource) {
    failUsage(`Ressource inconnue : ${resourceName}. Aucun endpoint n'a été appelé.`);
    printResourceList();
  } else if (!resource.enabled) {
    failUsage(`Ressource désactivée : ${resourceName}. ${resource.reason}`);
  } else {
    let endpoint = `${resourceName} (non construit)`;
    try {
      const configuration = readConfiguration();
      endpoint = resource.buildEndpoint(configuration);
      const client = new ReadonlySportEasyClient(configuration);
      const capturedAt = new Date().toISOString();
      const response = await client.getJson(endpoint, { version: resource.version });
      const schema = inspectJson(response, { resource: resourceName, endpoint, capturedAt });

      await Promise.all([
        mkdir(rawDirectory, { recursive: true, mode: 0o700 }),
        mkdir(schemaDirectory, { recursive: true, mode: 0o700 }),
      ]);

      const rawFile = `${rawDirectory}${resourceName}.json`;
      const schemaFile = `${schemaDirectory}${resourceName}.schema.json`;
      await writeJsonAtomically(rawFile, response);
      await writeJsonAtomically(schemaFile, schema);

      console.log("Capture SportEasy terminée");
      console.log(`- Ressource : ${resourceName}`);
      console.log(`- Endpoint : GET ${endpoint}`);
      console.log(`- Réponse brute : ${relative(projectRoot, rawFile)}`);
      console.log(`- Structure : ${relative(projectRoot, schemaFile)}`);
      console.log("- Aucun cookie ou header d'authentification n'a été enregistré.");
    } catch (error) {
      if (!error.endpoint) error.endpoint = endpoint;
      printRequestError(error);
      process.exitCode = 1;
    }
  }
}
