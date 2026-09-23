import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("l’espace Effectif & transferts reste préparé mais n’est ni affiché ni chargé dans le eStaff", async () => {
  const [home, page, client] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("estaff/index.html", root), "utf8"),
    readFile(new URL("estaff/assets/effectif-workspace.js", root), "utf8"),
  ]);
  assert.doesNotMatch(home, /aria-label="Accéder à l’effectif et aux transferts"/);
  assert.doesNotMatch(home, /\.\/estaff\/\?workspace=effectif/);
  assert.doesNotMatch(page, /effectif-workspace\.css\?v=/);
  assert.doesNotMatch(page, /effectif-workspace\.js\?v=/);
  assert.match(client, /window\.addEventListener\(SESSION_EVENT/);
  assert.match(client, /if \(!authenticated\) return/);
  assert.match(client, /clearWorkspace\(\)/);
  assert.match(client, /Authorization:`Bearer \$\{sessionToken\}`/);
  assert.match(client, /privateRequest\("effectif-transfers"\)/);
  assert.match(client, /privateRequest\("effectif-transfers\/status"/);
  assert.match(client, /privateRequest\("effectif-transfers\/case"/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|document\.cookie/);
});

test("les cinq vues, le circuit humain et les garde-fous sont visibles", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("estaff/assets/effectif-workspace.js", root), "utf8"),
    readFile(new URL("estaff/assets/effectif-workspace.css", root), "utf8"),
  ]);
  for (const label of ["État de l’effectif", "Arrivées", "Départs", "Prospects", "Historique"]) assert.match(client, new RegExp(label));
  for (const agent of ["Victor", "Sophie", "Camélia", "Joyce", "Patricia · Francisco", "Oscar"]) assert.match(client, new RegExp(agent));
  assert.match(client, /sans donnée médicale/);
  for (const label of ["Disponible", "Limité", "Indisponible", "Retour progressif"]) assert.match(client, new RegExp(label));
  for (const tone of ["success", "warning", "danger", "info", "arrival", "departure", "prospect"]) assert.match(styles, new RegExp(`\\.${tone}`));
  assert.match(client, /health_detail_forbidden/);
  assert.match(client, /data-action="refresh"/);
  assert.match(client, /role="tablist"/);
  assert.match(client, /aria-live="polite"/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media\(max-width:700px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("les trois profils Transferts disposent chacun d’un espace interactif et d’un fil en lecture seule", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("estaff/assets/effectif-workspace.js", root), "utf8"),
    readFile(new URL("estaff/assets/effectif-workspace.css", root), "utf8"),
  ]);
  for (const agent of ["Salma", "Mateo", "Priya"]) assert.match(client, new RegExp(agent));
  for (const role of ["Coordinatrice des nouvelles arrivées", "Coordinateur des départs confirmés", "Coordinatrice des prospects et du recrutement"]) assert.match(client, new RegExp(role));
  assert.match(client, /AGENT ACTIF · eSPORTIF/);
  assert.match(client, /portraits\/active\/salma-v1\.png/);
  assert.match(client, /portraits\/active\/mateo-v1\.png/);
  assert.match(client, /portraits\/active\/priya-v1\.png/);
  assert.match(client, /LECTURE SEULE/);
  assert.match(client, /aria-expanded/);
  assert.match(client, /transferAgentEvents/);
  assert.match(client, /workflowEvents/);
  assert.match(client, /caseWorkflows/);
  assert.match(client, /Créer l’arrivée liée/);
  assert.match(client, /slice\(currentIndex, currentIndex \+ 2\)/);
  assert.doesNotMatch(client, /ew-agent-composer|Confiez une mission à Salma|Confiez une mission à Mateo|Confiez une mission à Priya/);
  for (const selector of ["ew-transfer-agent-rail", "ew-agent-space", "ew-agent-workflow", "ew-agent-feed"]) assert.match(styles, new RegExp(`\\.${selector}`));
});

test("les workflows Transferts s’imbriquent avec le circuit eStaff existant", async () => {
  const client = await readFile(new URL("estaff/assets/effectif-workspace.js", root), "utf8");
  for (const actor of ["Patricia", "Sophie", "Victor", "Camélia", "Joyce · Francisco", "Oscar", "Dirigeant"]) assert.match(client, new RegExp(actor));
  assert.match(client, /ne confirme jamais seul un départ/);
  assert.match(client, /Les contacts, essais, offres et recrutements restent des décisions humaines/);
  assert.match(client, /44 personnes actives/);
});

test("les écritures sportives conversationnelles exigent un message d’origine de Fabien Perals", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("estaff/assets/effectif-workspace.js", root), "utf8"),
    readFile(new URL("estaff/assets/effectif-workspace.css", root), "utf8"),
  ]);
  assert.match(client, /seul un message écrit par Fabien Perals peut alimenter une donnée sportive/);
  assert.match(client, /fabien_perals:"Message d’origine de Fabien Perals"/);
  assert.match(client, /const WRITABLE_SOURCE =/);
  assert.match(client, /sport_source_not_fabien/);
  assert.match(client, /source:source\.value/);
  assert.match(client, /source:sourceSelect\.value/);
  assert.match(client, /source:item\.source/);
  assert.match(styles, /\.ew-source-policy/);
});
