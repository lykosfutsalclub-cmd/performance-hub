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
  assert.match(script,/Point fort/);
  assert.match(script,/Axe d’amélioration/);
  assert.match(script,/agentDialog/);
  assert.match(script,/Missions enregistrées/);
  assert.match(script,/Sans difficulté/);
  assert.match(script,/Portrait corporate/);
  assert.match(script,/Pas encore de mission enregistrée/);
  assert.match(script,/\["overview","Tableau de bord"\]/);
  assert.doesNotMatch(script,/\["overview","Entreprise"\]/);
});

test("les indicateurs reposent sur l’activité enregistrée et restent neutres sans historique", async () => {
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");

  assert.match(script,/teamState\.returns/);
  assert.match(script,/teamState\.agentStates/);
  assert.match(script,/successRate===null\?"—"/);
  assert.match(script,/agents en mission/);
  assert.match(script,/missions terminées aujourd’hui/);
  assert.match(script,/sans difficulté/);
  assert.doesNotMatch(script,/style="--service|style="--score|style="--filter/);
});

test("la page charge l’accueil humain après les protections existantes", async () => {
  const page = await readFile(new URL("estaff/index.html",root),"utf8");
  const report = await readFile(new URL("estaff/assets/esupport-report.js",root),"utf8");
  const style = await readFile(new URL("estaff/assets/team-home.css",root),"utf8");

  assert.match(page,/team-home\.css\?v=20260923-lykos-scroll-v2/);
  assert.match(page,/team-home\.js\?v=20260923-dashboard-label-v5/);
  assert.ok(page.indexOf("esupport-report.js") < page.indexOf("team-home.js"));
  assert.match(report,/new CustomEvent\("lykos:estaff-team-state"/);
  assert.match(page,/noindex,nofollow/);
  assert.match(style,/Identité Lykos : continuité visuelle avec le Performance Hub/);
  assert.match(style,/--company-bg:#011834/);
  assert.match(style,/--company-gold:#d0b631/);
  assert.match(style,/linear-gradient\(to bottom,#004497 0%,#011834 100%\)/);
  assert.match(style,/font-family:"OMMarseille",Georgia,serif/);
  assert.match(style,/body\.lykos-team-home-active #estaff-root>main \{[\s\S]*position:static!important;[\s\S]*overflow:visible!important;/);
  assert.match(style,/body\.lykos-team-home-active \{[\s\S]*overflow-y:auto!important;/);
});

test("la navigation principale reste fixée en bas et le futur poste eRH attend un prénom", async () => {
  const performanceHub = await readFile(new URL("index.html",root),"utf8");

  assert.match(performanceHub,/\.lykos-headnav \{[\s\S]*position:fixed;[\s\S]*bottom:/);
  assert.match(performanceHub,/Poste à pourvoir/);
  assert.match(performanceHub,/Aucune intégration ne démarre tant que le prénom n’a pas été validé/);
  assert.doesNotMatch(performanceHub,/eRH · sous l’autorité d’Oscar/);
});
