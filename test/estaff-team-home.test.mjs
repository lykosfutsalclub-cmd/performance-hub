import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";

const root = new URL("../",import.meta.url);

test("l’accueil eStaff présente les 45 personnes avec leurs portraits", async () => {
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");
  const portraits = await readdir(new URL("estaff/assets/portraits/team/",root));
  const people = [...script.matchAll(/^\s*\["([^"]+)","(?:direction|operations|sport|data|academy|support|brand|security|finance|equipment|partnerships|memory|hr)"/gm)].map(match => match[1]);

  assert.equal(people.length,45);
  assert.equal(new Set(people).size,45);
  assert.equal(portraits.filter(file => /\.(?:jpg|png)$/.test(file)).length,45);
  assert.ok(people.includes("Nathan"));
  assert.match(script,/Bonjour, voici votre équipe/);
  assert.match(script,/Point fort/);
  assert.match(script,/Axe d’amélioration/);
  assert.match(script,/agentDialog/);
  assert.match(script,/Missions contrôlées/);
  assert.doesNotMatch(script,/Missions enregistrées/);
  assert.match(script,/Contrôles programmés/);
  assert.match(script,/activityRows\(Infinity\)/);
  assert.match(script,/data-feedback="positive"/);
  assert.match(script,/data-feedback="negative"/);
  assert.match(script,/Missions bloquées/);
  assert.doesNotMatch(script,/Sans difficulté/);
  assert.match(script,/Portrait corporate/);
  assert.match(script,/Pas encore de mission enregistrée/);
  assert.match(script,/\["overview","Tableau de bord","Accueil"\]/);
  assert.doesNotMatch(script,/\["overview","Entreprise"\]/);
});

test("les indicateurs reposent sur l’activité enregistrée et restent neutres sans historique", async () => {
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");

  assert.match(script,/teamState\.returns/);
  assert.match(script,/teamState\.agentStates/);
  assert.match(script,/État non vérifié/);
  assert.match(script,/Disponible vérifié/);
  assert.match(script,/engineProof/);
  assert.match(script,/data-ticket/);
  assert.match(script,/tickets\/record/);
  assert.doesNotMatch(script,/data-oscar/);
  assert.match(script,/Exécutée · à contrôler/);
  assert.match(script,/Incomplète/);
  assert.match(script,/data-view="connections"/);
  assert.match(script,/agents en mission/);
  assert.match(script,/missions terminées aujourd’hui/);
  assert.match(script,/missions bloquées/);
  assert.doesNotMatch(script,/style="--service|style="--score|style="--filter/);
});

test("la page charge l’accueil humain après les protections existantes", async () => {
  const page = await readFile(new URL("estaff/index.html",root),"utf8");
  const report = await readFile(new URL("estaff/assets/esupport-report.js",root),"utf8");
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");
  const style = await readFile(new URL("estaff/assets/team-home.css",root),"utf8");

  assert.match(page,/team-home\.css\?v=20260924-company-v17/);
  assert.match(page,/team-home\.js\?v=20260924-company-v16/);
  assert.match(script,/logo-lykos-intro-integral-2026\.png/);
  assert.doesNotMatch(script,/logo-lykos-intro-carre-2026\.png/);
  assert.doesNotMatch(page,/personal-access\.js/);
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

test("les identifiants techniques des personnes sont affichés avec leur prénom officiel", async () => {
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");

  assert.match(script,/const displayAgentName = value => PEOPLE\.find/);
  assert.match(script,/map\(displayAgentName\)/);
  assert.match(script,/openAgentName=displayAgentName\(name\)/);
  assert.match(script,/agentName=displayAgentName\(entry\.agent\)/);
});

test("la navigation principale reste fixée en bas et Ezio est intégré à eRH", async () => {
  const performanceHub = await readFile(new URL("index.html",root),"utf8");

  assert.match(performanceHub,/\.lykos-headnav \{[\s\S]*position:fixed;[\s\S]*bottom:/);
  assert.match(performanceHub,/<strong>Ezio<\/strong><small>Responsable de l’intégration<\/small>/);
  assert.doesNotMatch(performanceHub,/Poste à pourvoir/);
  assert.doesNotMatch(performanceHub,/eRH · sous l’autorité d’Oscar/);
});

test("la navigation eStaff reste en bas quelle que soit la largeur", async () => {
  const style = await readFile(new URL("estaff/assets/team-home.css",root),"utf8");
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");
  assert.match(style,/#lykos-team-home \{padding-bottom:calc\(88px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(style,/\.company-nav \{position:fixed;z-index:70;left:50%;bottom:0;[\s\S]*?width:min\(1120px,calc\(100vw - 40px\)\);height:76px/);
  assert.match(style,/background:rgba\(9,29,79,\.97\)!important/);
  assert.match(style,/\.company-nav button\.is-active::after \{[\s\S]*?background:var\(--company-gold\)\}/);
  assert.doesNotMatch(style,/\.company-nav \{[^}]*background:#d0b631!important/);
  assert.doesNotMatch(style,/@media \(min-width:861px\) \{[\s\S]*?\.company-nav \{position:fixed/);
  assert.doesNotMatch(style,/\.company-nav \{grid-column:1\/-1;grid-row:2/);
  assert.match(script,/<\/header><nav class="company-nav" aria-label="Navigation eStaff"><span class="company-nav-context"/);
  assert.match(script,/class="company-nav-items"/);
  assert.match(script,/class="company-nav-status"[\s\S]*?\$\{PEOPLE\.length\} agents/);
  assert.match(script,/\["overview","Tableau de bord","Accueil"\]/);
  assert.match(script,/class="company-nav-mobile-label" aria-hidden="true">/);
  assert.match(script,/aria-label="\$\{label\}" aria-pressed=/);
  assert.match(style,/\.company-nav button::before \{[\s\S]*?-webkit-mask-size:contain/);
  assert.match(style,/@media \(max-width:860px\) \{[\s\S]*?\.company-nav-context,\.company-nav-status \{display:none\}/);
  assert.match(style,/\.company-nav-label \{display:none\}\.company-nav-mobile-label \{display:block/);
});

test("les informations principales d’une fiche agent remplissent la largeur sur mobile", async () => {
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");
  const style = await readFile(new URL("estaff/assets/team-home.css",root),"utf8");

  assert.match(script,/<\/div><dl><div><dt>Responsable<\/dt>/);
  assert.match(script,/class="profile-current-mission"><dt>Mission actuelle<\/dt>/);
  assert.match(style,/@media \(max-width:600px\) \{[\s\S]*?\.profile-header dl \{grid-column:1\/-1;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:10px\}/);
  assert.match(style,/\.profile-header \.profile-current-mission \{grid-column:1\/-1\}/);
});

test("les fiches mission résument le travail sans transformer la demande brute en grand titre", async () => {
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");
  const style = await readFile(new URL("estaff/assets/team-home.css",root),"utf8");

  assert.match(script,/function missionPresentation\(mission\)/);
  assert.match(script,/title="Refonte de la navigation eStaff"/);
  assert.match(script,/class="mission-summary"><span>Résumé<\/span>/);
  assert.match(script,/Historique et demande d’origine/);
  assert.doesNotMatch(script,/<h2 id="mission-title">\$\{escapeHtml\(humanizeText\(mission\.latest\.title/);
  assert.match(style,/\.company-mission-detail h2 \{[^}]*font-size:clamp\(1\.45rem,2\.3vw,2rem\)/);
  assert.match(style,/\.mission-summary \{[^}]*border-left:3px solid var\(--service\)/);
});

test("le Journal d’équipe reprend les mêmes titres courts et résumés métier", async () => {
  const script = await readFile(new URL("estaff/assets/team-home.js",root),"utf8");
  const style = await readFile(new URL("estaff/assets/team-home.css",root),"utf8");

  assert.match(script,/function activityPresentation\(entry\)/);
  assert.match(script,/presentation=activityPresentation\(entry\)/);
  assert.match(script,/<strong>\$\{escapeHtml\(presentation\.title\)\}<\/strong><small>\$\{escapeHtml\(presentation\.summary\)\}<\/small>/);
  assert.match(script,/activityPresentation\(\{\.\.\.entry,activityType:"mission"\}\)/);
  assert.doesNotMatch(script,/class="activity-summary"[\s\S]{0,300}<strong>\$\{escapeHtml\(humanizeText\(entry\.title/);
  assert.match(style,/\.activity-summary small \{[^}]*-webkit-line-clamp:2/);
});
