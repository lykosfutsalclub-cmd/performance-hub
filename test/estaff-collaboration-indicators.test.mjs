import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../",import.meta.url);

test("l’espace Indicateurs affiche les cinq mesures sans inventer de valeur", async () => {
  const source = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");
  const styles = await readFile(new URL("estaff/assets/team-home.css",root),"utf8");
  assert.match(source,/\["indicators","Indicateurs","Mesures"\]/);
  for (const label of [
    "Missions terminées sans dirigeant",
    "Résultats fondés sur une vraie source",
    "Temps jusqu’au résultat utile",
    "Coût IA par mission utile",
    "Décisions nécessitant un humain",
  ]) assert.ok(source.includes(label),label);
  assert.match(source,/Pas encore mesuré/);
  assert.match(source,/teamState\.collaboration/);
  assert.match(styles,/\.company-indicator-list/);
  assert.match(styles,/@media \(max-width:600px\)[\s\S]*\.company-indicator-list>div \{grid-template-columns:1fr/);
});
