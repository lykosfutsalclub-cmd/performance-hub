import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source = readFileSync(new URL("../estaff/assets/esupport-report.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../estaff/assets/esupport-report.css", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/esupport-monitor.yml", import.meta.url), "utf8");

const agents = [
  "Oscar", "Sophie", "Nadir", "Alice", "Victor", "Giannis", "Patricia", "Gaston", "Véronique", "Sandrine", "Léonard", "Konstantinos",
  "Sonia", "Amara", "Elena", "Akira", "Joyce", "Thiago", "Jefferson", "Élise", "Samir", "Roman", "Camélia", "Francisco", "Tamara", "Inès", "Giorgios", "Vincenzo",
  "Angela", "Juan", "Marco", "Rafael", "Alba", "Lola", "Nora", "Yanis", "Salomé", "Malik", "Ella", "Bastien",
  "Salma", "Mateo", "Priya",
];

test("les 43 agents possèdent un contrat opérationnel visible", () => {
  assert.equal(agents.length, 43);
  assert.equal(new Set(agents).size, 43);
  for (const agent of agents) {
    assert.match(source, new RegExp(`${agent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*\\{inputs:`), agent);
  }
  for (const label of ["Déclencheur", "Informations nécessaires", "Résultat attendu", "Contrôle qualité", "Preuve visible", "État actuel"]) {
    assert.ok(source.includes(label), label);
  }
  for (const label of ["Responsable eRH", "Temps de travail & coûts", "Planification & processus", "Besoins & missions complémentaires", "Environnement & optimisation"]) {
    assert.ok(source.includes(label), label);
  }
  for (const responsibility of ["Cadre de travail", "Temps de travail", "Timing", "Besoins", "Optimisation"]) {
    assert.ok(source.includes(responsibility), responsibility);
  }
  assert.match(source, /eRH agit sous l’autorité d’Oscar, eGeneral Director/);
  assert.match(source, /mission complémentaire/);
});

test("les cartes agent distinguent la connexion métier de la simple exécution", () => {
  assert.match(source,/\["Connexion métier", sourceStatus\]/);
  assert.match(source,/Autorisation Google Workspace requise/);
  assert.match(source,/aucune donnée n’est remplacée par une estimation/);
  assert.match(source,/state\.businessSources/);
  assert.doesNotMatch(source,/cadenceState|CADENCE_API/);
});

test("les cinq états agentiques sont explicites et jamais remplacés par Disponible", () => {
  for (const state of ["En attente", "Incomplet", "Exécuté", "Contrôlé", "Bloqué"]) assert.ok(source.includes(state), state);
  assert.doesNotMatch(source, /\bDisponible\b/);
  assert.match(css, /\.lykos-agent-state\.is-controlled/);
  assert.match(css, /\.lykos-agent-state\.is-blocked/);
});

test("les cinq jalons techniques restent distincts", () => {
  for (const label of ["Tâche automatique", "Synchronisation SportEasy", "Nouvelles données", "Publication", "Fraîcheur"]) {
    assert.ok(source.includes(label), label);
  }
  for (const stage of ["automation", "sporteasySync", "newData", "publication", "freshness"]) {
    assert.ok(workflow.includes(stage), stage);
  }
  assert.ok(workflow.includes("worker/operation-state"));
  assert.equal((workflow.match(/https:\/\/lykos-estaff-service\.lykosfutsalclub\.workers\.dev\/api\/estaff\/worker\/operation-state/g) || []).length, 2);
  assert.doesNotMatch(workflow, /performance-hub-lykos-fc\.fab-mysterio\.chatgpt\.site\/api\/estaff\/worker\/operation-state/);
});

test("la présentation s’adapte aux écrans étroits", () => {
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.match(css, /\.lykos-service-framework\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:700px\)\{\.lykos-service-framework\{grid-template-columns:1fr\}/);
});
