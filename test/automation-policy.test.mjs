import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const workflow = await readFile(new URL(".github/workflows/esupport-monitor.yml", root), "utf8");
const recoveryWorkflow = await readFile(new URL(".github/workflows/esupport-autorecovery.yml", root), "utf8");
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

test("les actions GitHub utilisent toutes une révision exacte", () => {
  const revisions = [...`${workflow}\n${recoveryWorkflow}`.matchAll(/uses:\s+actions\/[^@\s]+@([^\s#]+)/g)].map((match) => match[1]);
  assert.ok(revisions.length > 0);
  assert.ok(revisions.every((revision) => /^[a-f0-9]{40}$/.test(revision)));
});

test("Node.js est verrouillé sur la même version partout", () => {
  assert.equal(packageJson.engines.node, "24.19.0");
  assert.match(workflow, /node-version:\s+"24\.19\.0"/);
});

test("tests, Panthéon et audit précèdent la publication automatique", () => {
  const tests = workflow.indexOf("node scripts/verify-publication-tests.mjs");
  const pantheon = workflow.indexOf("node scripts/sporteasy/build-pantheon-data.mjs");
  const audit = workflow.indexOf("node scripts/sporteasy/audit-public-data.mjs");
  const publication = workflow.indexOf("git push origin HEAD:main");
  assert.ok(tests >= 0 && pantheon > tests && audit > pantheon && publication > audit);
});

test("les permissions globales sont fermées et attribuées par tâche", () => {
  assert.match(workflow, /^permissions:\s*\{\}/m);
  assert.match(workflow, /chaine-esupport:[\s\S]*?permissions:[\s\S]*?contents:\s*write[\s\S]*?id-token:\s*write[\s\S]*?pages:\s*write/);
  assert.match(workflow, /surveillance-fraicheur:[\s\S]*?permissions:[\s\S]*?id-token:\s*write/);
});

test("les notifications mobiles ont une interface, un manifeste et un service actif", async () => {
  for (const path of ["estaff/assets/notifications.js", "estaff/assets/notifications.css", "estaff/sw.js"]) {
    await access(new URL(path, root));
  }
  const page = await readFile(new URL("estaff/index.html", root), "utf8");
  const client = await readFile(new URL("estaff/assets/notifications.js", root), "utf8");
  const serviceWorker = await readFile(new URL("estaff/sw.js", root), "utf8");
  assert.match(page, /manifest\.webmanifest/);
  assert.match(page, /notifications\.js/);
  assert.match(client, /push\/subscription/);
  assert.match(serviceWorker, /showNotification/);
});

test("les échecs et les données vieilles de plus de 36 heures déclenchent une alerte", () => {
  assert.match(workflow, /Signaler clairement une synchronisation en échec/);
  assert.match(workflow, /36 \* 60 \* 60 \* 1000/);
  assert.match(workflow, /core\.setFailed\(`ALERTE fraîcheur/);
  assert.match(workflow, /worker\/mobile-alert/);
});

test("la fraîcheur est contrôlée après la reconstruction éventuelle", () => {
  assert.match(workflow, /surveillance-fraicheur:[\s\S]*?needs:\s*chaine-esupport[\s\S]*?if:\s*\$\{\{ always\(\) \}\}/);
});

test("un premier échec déclenche une seule reprise autonome et ciblée", () => {
  assert.match(recoveryWorkflow, /workflows:\s*\["Contrôle quotidien eSupport"\]/);
  assert.match(recoveryWorkflow, /conclusion == 'failure'/);
  assert.match(recoveryWorkflow, /run_attempt == 1/);
  assert.match(recoveryWorkflow, /reRunWorkflowFailedJobs/);
  assert.match(recoveryWorkflow, /permissions:\s*\{\}/);
  assert.match(recoveryWorkflow, /relance-limitee:[\s\S]*?permissions:[\s\S]*?actions:\s*write/);
  assert.doesNotMatch(recoveryWorkflow, /contents:\s*write|pages:\s*write|id-token:\s*write/);
});

test("la synchronisation quotidienne vise 10 h à Paris toute l'année", () => {
  assert.match(workflow, /cron:\s*"7 8 \* \* \*"/);
  assert.match(workflow, /cron:\s*"7 9 \* \* \*"/);
  assert.match(workflow, /timeZone:\s*"Europe\/Paris"/);
  assert.match(workflow, /dailyWindow && parisHour === 10/);
  assert.doesNotMatch(workflow, /cron:\s*"7 23 \* \* \*"/);
});

test("Oscar publie à 11 h 30 à Paris sans brief pendant le contrôle de 10 h", () => {
  assert.match(workflow, /cron:\s*"30 9 \* \* \*"/);
  assert.match(workflow, /cron:\s*"30 10 \* \* \*"/);
  assert.match(workflow, /const oscarWindow = \["30 9 \* \* \*", "30 10 \* \* \*"\]\.includes\(scheduledCron\) && parisHour === 11/);
  assert.match(workflow, /core\.setOutput\("oscar", String\(isManual \|\| oscarWindow\)\)/);
  assert.match(workflow, /const oscarDue = process\.env\.ESTAFF_OSCAR === "true"/);
  assert.match(workflow, /if \(oscarDue\) \{[\s\S]*?"oscar-brief"/);
  assert.doesNotMatch(workflow, /if \(mode === "daily" \|\| mode === "manual"\)/);
});

test("Giannis n’est déclenché que lorsque la synchronisation publie de nouvelles données", () => {
  assert.match(workflow, /DATA_CHANGED:\s*\$\{\{ steps\.publication\.outputs\.changed \}\}/);
  assert.match(workflow, /report\?\.status === "operational" && process\.env\.DATA_CHANGED === "true"/);
  assert.doesNotMatch(workflow, /report\.status === "operational" && \(mode === "release" \|\| mode === "manual"\)/);
});

test("Oscar affiche la fraîcheur et peut demander une synchronisation immédiate", async () => {
  const source = await readFile(new URL("estaff-src/Supervision.tsx", root), "utf8");
  const page = await readFile(new URL("estaff/index.html", root), "utf8");
  assert.match(source, /Dernière synchronisation il y a \$\{hours\} h/);
  assert.match(source, /Relancer maintenant la synchronisation SportEasy/);
  assert.match(source, /ACTION_SYSTÈME PUB2/);
  assert.match(source, /team-data\.js\?sync_status=/);
  assert.match(page, /connect-src 'self'/);
});

test("la communication eStaff présente uniquement 28 agents", async () => {
  const files = [
    "estaff-src/Supervision.tsx",
    "estaff/assets/esupport-report.js",
  ];
  const text = (await Promise.all(files.map((path) => readFile(new URL(path, root), "utf8")))).join("\n");
  assert.match(text, /28 agents/);
  assert.doesNotMatch(text, /sous[- ]agents?|agents? directs?/i);
});

test("les 28 agents sont consultables et seul Oscar reçoit les missions", async () => {
  const bundle = await readFile(new URL("estaff/assets/estaff.js", root), "utf8");
  const supervision = await readFile(new URL("estaff/assets/esupport-report.js", root), "utf8");
  assert.match(bundle, /Rechercher un agent/);
  for (const name of ["Oscar", "Sophie", "Nadir", "Alice", "Victor", "Giannis", "Sonia", "Patricia", "Gaston", "Vincenzo", "Sandrine", "Konstantinos", "Amara", "Elena", "Akira", "Joyce", "Thiago", "Jefferson", "Samir", "Roman", "Francisco", "Tamara", "Giorgios"]) {
    assert.match(bundle, new RegExp(name));
  }
  for (const escapedName of ["V\\xE9ronique", "L\\xE9onard", "\\xC9lise", "Cam\\xE9lia", "In\\xE8s"]) assert.ok(bundle.includes(escapedName));
  assert.match(supervision, /agent === "Oscar" && latestCapabilities\.oscarMissions === true/);
  assert.match(supervision, /composer\.hidden = !oscarMissionEnabled/);
  assert.doesNotMatch(supervision, /Consultation uniquement|lecture seule/);
  assert.match(supervision, /reportEntries\(\)\.filter\(entry => entry\.agent === agent\)/);
});

test("Vincenzo appartient à eSportif dans les deux présentations publiques", async () => {
  const bundle = await readFile(new URL("estaff/assets/estaff.js", root), "utf8");
  const performanceHub = await readFile(new URL("index.html", root), "utf8");
  assert.match(bundle, /\["Vincenzo",[^\n]+,"sport"\],/);
  assert.doesNotMatch(bundle, /\["Vincenzo",[^\n]+,"support"\],/);

  const sportSection = performanceHub.match(/<section class="lykos-estaff-service"><h4>eSportif<\/h4>([\s\S]*?)<\/section>/)?.[1] || "";
  const supportSection = performanceHub.match(/<section class="lykos-estaff-service"><h4>eSupport<\/h4>([\s\S]*?)<\/section>/)?.[1] || "";
  assert.match(sportSection, /<strong>Vincenzo<\/strong>/);
  assert.doesNotMatch(supportSection, /<strong>Vincenzo<\/strong>/);
});

test("l’interface publique annonce la version 3.13.0 du Rulebook", async () => {
  const supervision = await readFile(new URL("estaff/assets/esupport-report.js", root), "utf8");
  assert.match(supervision, /version\.textContent = "Rulebook 3\.13\.0"/);
});

test("les récapitulatifs du planificateur cloud rejoignent les fils publics sans remplacer eSupport", async () => {
  const supervision = await readFile(new URL("estaff/assets/esupport-report.js", root), "utf8");
  const page = await readFile(new URL("estaff/index.html", root), "utf8");
  assert.match(supervision, /const CADENCE_API = "https:\/\/lykos-estaff-service\.lykosfutsalclub\.workers\.dev\/api\/estaff"/);
  assert.match(supervision, /connectCadence\(code,loginGeneration\)/);
  assert.match(supervision, /const primaryLoad = loadReport\(payload\.token,loginGeneration\)/);
  assert.match(supervision, /if \(await cadenceConnection\) await loadCadenceReport\(loginGeneration\)/);
  assert.match(supervision, /generation !== sessionGeneration/);
  assert.match(supervision, /history:mergeEntries\(latestReport\.history, cadenceReport\.history\)/);
  assert.match(supervision, /latestReturns = mergeEntries\(latestReturns, cadenceState\.returns\)/);
  assert.match(supervision, /fetchWithTimeout\(`\$\{CADENCE_API\}\/esupport`/);
  assert.doesNotMatch(supervision, /latestCapabilities\s*=\s*\{\.\.\.\(cadenceState\.capabilities/);
  assert.match(page, /esupport-report\.js\?v=20260919-cadence-bridge/);
  assert.match(page, /connect-src 'self' https:\/\/performance-hub-lykos-fc\.fab-mysterio\.chatgpt\.site https:\/\/lykos-estaff-service\.lykosfutsalclub\.workers\.dev/);
  assert.match(supervision, /const API = "https:\/\/performance-hub-lykos-fc\.fab-mysterio\.chatgpt\.site\/api\/estaff"/);
});

test("la feuille de style correspond à la supervision complète sur ordinateur et mobile", async () => {
  const styles = await readFile(new URL("estaff/assets/estaff.css", root), "utf8");
  assert.match(styles, /grid-template-columns:260px minmax\(300px,1fr\) 250px/);
  assert.match(styles, /scroll-snap-type:x proximity/);
  assert.match(styles, /@media\(max-width:700px\)/);
});

test("la supervision complète conserve la synchronisation SportEasy", async () => {
  const supervision = await readFile(new URL("estaff/assets/esupport-report.js", root), "utf8");
  assert.match(supervision, /ACTION_SYSTÈME PUB2/);
  assert.match(supervision, /Relancer maintenant la synchronisation SportEasy/);
  assert.match(supervision, /team-data\.js\?sync_status=/);
});
