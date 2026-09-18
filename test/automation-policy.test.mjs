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

test("Oscar affiche la fraîcheur et peut demander une synchronisation immédiate", async () => {
  const source = await readFile(new URL("estaff-src/Supervision.tsx", root), "utf8");
  const page = await readFile(new URL("estaff/index.html", root), "utf8");
  assert.match(source, /Dernière synchronisation il y a \$\{hours\} h/);
  assert.match(source, /Relancer maintenant la synchronisation SportEasy/);
  assert.match(source, /ACTION_SYSTÈME PUB2/);
  assert.match(source, /team-data\.js\?sync_status=/);
  assert.match(page, /connect-src 'self'/);
});

test("la communication eStaff présente uniquement 27 agents", async () => {
  const files = [
    "estaff-src/Supervision.tsx",
    "estaff/assets/esupport-report.js",
  ];
  const text = (await Promise.all(files.map((path) => readFile(new URL(path, root), "utf8")))).join("\n");
  assert.match(text, /27 agents/);
  assert.doesNotMatch(text, /sous[- ]agents?|agents? directs?/i);
});
