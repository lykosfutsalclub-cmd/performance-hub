import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";

const root = new URL("../",import.meta.url);

test("l’accueil eStaff présente les 43 personnes avec leurs portraits", async () => {
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");
  const portraits = await readdir(new URL("estaff/assets/portraits/team/",root));
  const people = [...script.matchAll(/^\s*\["([^"]+)","(?:direction|operations|sport|data|academy|support|brand|security|finance|equipment|partnerships|memory|hr)"/gm)].map(match => match[1]);

  assert.equal(people.length,43);
  assert.equal(new Set(people).size,43);
  assert.equal(portraits.filter(file => file.endsWith(".jpg")).length,43);
  assert.match(script,/Bonjour, voici votre équipe/);
  assert.match(script,/Son atout/);
  assert.match(script,/À accompagner/);
  assert.match(script,/Pas encore de mission enregistrée/);
});

test("les indicateurs reposent sur l’activité enregistrée et restent neutres sans historique", async () => {
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");

  assert.match(script,/teamState\.returns/);
  assert.match(script,/teamState\.agentStates/);
  assert.match(script,/score === null \? "—"/);
  assert.match(script,/Missions en cours/);
  assert.match(script,/Missions réalisées/);
  assert.match(script,/Validées sans blocage/);
  assert.doesNotMatch(script,/style="--service|style="--score|style="--filter/);
});

test("la page charge l’accueil humain après les protections existantes", async () => {
  const page = await readFile(new URL("estaff/index.html",root),"utf8");
  const report = await readFile(new URL("estaff/assets/esupport-report.js",root),"utf8");

  assert.match(page,/team-home\.css\?v=20260921-human-team/);
  assert.match(page,/team-home\.js\?v=20260921-human-team/);
  assert.ok(page.indexOf("esupport-report.js") < page.indexOf("team-home.js"));
  assert.match(report,/new CustomEvent\("lykos:estaff-team-state"/);
  assert.match(page,/noindex,nofollow/);
});
