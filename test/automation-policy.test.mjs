import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const workflow = await readFile(new URL(".github/workflows/esupport-monitor.yml", root), "utf8");
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

test("les actions GitHub utilisent toutes une révision exacte", () => {
  const revisions = [...workflow.matchAll(/uses:\s+actions\/[^@\s]+@([^\s#]+)/g)].map((match) => match[1]);
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
  assert.match(workflow, /surveillance-fraicheur:[\s\S]*?permissions:\s*\{\}/);
});

test("les notifications mobiles inactives sont retirées et désinscrites", async () => {
  for (const path of ["estaff/assets/notifications.js", "estaff/assets/notifications.css", "estaff/sw.js"]) {
    await assert.rejects(access(new URL(path, root)));
  }
  const overlay = await readFile(new URL("estaff/assets/esupport-report.js", root), "utf8");
  assert.match(overlay, /registration\.unregister\(\)/);
});

test("les échecs et les données vieilles de plus de 36 heures déclenchent une alerte", () => {
  assert.match(workflow, /Signaler clairement une synchronisation en échec/);
  assert.match(workflow, /36 \* 60 \* 60 \* 1000/);
  assert.match(workflow, /core\.setFailed\(`ALERTE fraîcheur/);
});
