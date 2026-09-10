import { readConfiguration } from "./lib/config.mjs";
import { ReadonlySportEasyClient, printRequestError } from "./lib/readonly-client.mjs";
import { getResource } from "./lib/resources.mjs";

const resource = getResource("team");
let endpoint = "teams/{teamId}/";

try {
  const configuration = readConfiguration();
  endpoint = resource.buildEndpoint(configuration);
  const client = new ReadonlySportEasyClient(configuration);
  const response = await client.getJson(endpoint);

  console.log("Diagnostic SportEasy : connexion réussie");
  console.log("- Code HTTP : 200-299");
  console.log(`- Endpoint : GET ${endpoint}`);
  console.log(`- Type de réponse : ${Array.isArray(response) ? "tableau" : typeof response}`);
  console.log("- Aucun secret n'a été affiché ni enregistré.");
} catch (error) {
  if (!error.endpoint) error.endpoint = endpoint;
  printRequestError(error);
  process.exitCode = 1;
}
