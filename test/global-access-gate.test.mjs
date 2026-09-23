import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [home, estaff, gate, gateStyles, bridge] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("estaff/index.html", root), "utf8"),
  readFile(new URL("access-gate.js", root), "utf8"),
  readFile(new URL("access-gate.css", root), "utf8"),
  readFile(new URL("estaff/assets/hub-session-bridge.js", root), "utf8"),
]);

test("le même contrôle d’accès précède le Performance Hub et le eStaff", () => {
  assert.match(home, /access-gate\.js\?v=20260923-global-access-v3/);
  assert.match(estaff, /\.\.\/access-gate\.js\?v=20260923-global-access-v3/);
  assert.ok(estaff.indexOf("access-gate.js") < estaff.indexOf("estaff.js"));
  assert.ok(estaff.indexOf("hub-session-bridge.js") < estaff.indexOf("estaff.js"));
});

test("le code n’est ni enregistré ni publié dans les fichiers", () => {
  assert.doesNotMatch(`${gate}\n${bridge}`, /9102|2019/);
  assert.doesNotMatch(gate, /(?:local|session)Storage\.setItem\([^,]+,\s*code/);
  assert.match(gate, /Authorization:`Bearer \$\{value\.token\}`/);
  assert.match(gate, /Trop de tentatives/);
});

test("la session vérifiée est commune aux pages et remplace le second clavier eStaff", () => {
  assert.match(gate, /lykos_performance_hub_tab_session_v2/);
  assert.match(gate, /sessionStorage\.setItem/);
  assert.doesNotMatch(gate, /localStorage\.setItem/);
  assert.match(gate, /\/state/);
  assert.match(gate, /lykos:hub-session/);
  assert.match(bridge, /LYKOS_HUB_ACCESS/);
  assert.match(bridge, /hubSession/);
  assert.match(bridge, /requestSubmit/);
  assert.match(bridge, /lykos-estaff-bridging/);
  assert.match(bridge, /revealInterfaceWhenReady/);
});

test("l’accueil reprend strictement la typographie et le cadrage du PH", () => {
  assert.match(gate, /PERFORMANCE<br>HUB/);
  assert.match(gate, /logo-lykos-intro-carre-2026\.png/);
  assert.match(gateStyles, /\.lykos-access-brand img \{[\s\S]*margin: 20px;/);
  assert.match(gateStyles, /\.lykos-access-brand strong \{[\s\S]*font-family: "OMMarseille";/);
  assert.doesNotMatch(gateStyles.match(/\.lykos-access-brand strong \{[\s\S]*?\}/)?.[0] || "", /Georgia|Times New Roman/);
});
