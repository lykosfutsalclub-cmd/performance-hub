import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../",import.meta.url);

test("l'onglet Match suit photo, contrôle humain et synchronisation SportEasy", async () => {
  const [page,home,client,style] = await Promise.all([
    readFile(new URL("estaff/index.html",root),"utf8"),
    readFile(new URL("estaff/assets/team-home.js",root),"utf8"),
    readFile(new URL("estaff/assets/match-entry.js",root),"utf8"),
    readFile(new URL("estaff/assets/match-entry.css",root),"utf8"),
  ]);
  assert.match(page,/match-entry\.css\?v=20261009-match-v1/);
  assert.match(page,/match-entry\.js\?v=20261009-match-v1/);
  assert.ok(page.indexOf("match-entry.js") < page.indexOf("team-home.js"));
  assert.match(home,/\["match","Match","Match"\]/);
  assert.match(home,/window\.LykosMatchEntry\?\.view\(\)/);
  assert.match(client,/capture="environment"/);
  assert.match(client,/accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(client,/Aucune donnée n’est publiée avant votre approbation/);
  assert.match(client,/J’ai contrôlé le match, le score, tous les buteurs et toutes les notes/);
  assert.match(client,/match-entry\/scan/);
  assert.match(client,/match-entry\/approve/);
  assert.match(client,/Note \/10/);
  assert.match(client,/\[1,2,3,4,5,6\]/);
  assert.match(client,/goalTotal !== payload\.score\.lykos/);
  assert.match(style,/\.match-workflow/);
});

test("la photo reste transitoire et aucune écriture SportEasy ne part avant approbation", async () => {
  const client = await readFile(new URL("estaff/assets/match-entry.js",root),"utf8");
  const scanBlock = client.slice(client.indexOf("async function scan"),client.indexOf("function integer"));
  const submitBlock = client.slice(client.indexOf("async function submit"),client.indexOf('document.addEventListener("click"'));
  assert.doesNotMatch(scanBlock,/match-entry\/approve/);
  assert.match(submitBlock,/match-entry\/approve/);
  assert.match(client,/La photo est transmise de façon temporaire pour être lue, puis n’est pas conservée/);
  assert.doesNotMatch(client,/localStorage|sessionStorage|indexedDB/);
});
