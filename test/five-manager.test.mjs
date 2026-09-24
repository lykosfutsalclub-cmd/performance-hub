import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [home, manager, script, styles, fonts] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("five-manager/index.html", root), "utf8"),
  readFile(new URL("five-manager/five-manager.js", root), "utf8"),
  readFile(new URL("five-manager/five-manager.css", root), "utf8"),
  readFile(new URL("five-manager/fonts.css", root), "utf8"),
]);

test("Five Manager est une expérience spéciale distincte de la navigation principale", () => {
  assert.match(home, /class="lykos-manager-launch" href="\.\/five-manager\/"/);
  assert.match(home, /five-manager\/logo-five-manager\.png/);
  assert.match(manager, /<b>Performance Hub<\/b>/);
  assert.match(manager, /logo-five-manager\.png/);
  assert.doesNotMatch(manager, /Identité temporaire/);
  assert.match(fonts, /font-family: "OMMarseille"/);
  assert.match(styles, /--display:"OMMarseille"/);
});

test("les huit espaces demandés sont présents et l’accès commun les protège", () => {
  for (const route of ["home", "squad", "lineup", "match", "report", "availability", "history", "staff"]) {
    assert.match(manager, new RegExp(`data-route="${route}"`));
  }
  assert.match(manager, /\.\.\/access-gate\.js\?v=20260924-global-access-v8/);
  assert.ok(manager.indexOf("access-gate.js") < manager.indexOf("five-manager.js"));
});

test("Five Manager réutilise les sources officielles et les profils existants", () => {
  assert.match(manager, /\.\.\/team-data\.js/);
  assert.match(manager, /\.\.\/player-secondary-data\.js/);
  assert.match(manager, /\.\.\/pantheon-data\.js/);
  assert.match(script, /LYKOS_TEAM_STATS/);
  assert.match(script, /LYKOS_SECONDARY_STATS/);
  assert.match(script, /from=five-manager/);
  assert.match(home, /lykos_five_manager_return/);
  assert.match(home, /selectPlayer\(requestedPlayer\)/);
});

test("la composition est interactive, persistante et fondée sur Metron", () => {
  for (const formation of ["1-2-1", "2-1-1", "2-2", "1-1-2"]) assert.match(script, new RegExp(`'${formation}'`));
  assert.match(script, /dragstart/);
  assert.match(script, /data-slot/);
  assert.match(script, /lykos_fm_lineup_v1/);
  assert.match(script, /player\.metron/);
  assert.match(script, /bestWinningPartner/);
  assert.match(script, /lykos_fm_lineup_scenarios_v1/);
  assert.match(script, /Comparateur de compositions/);
  for (const metric of ["metron", "creation", "finishing", "defensive"]) assert.match(script, new RegExp(metric));
});

test("le dossier de match permet d’avancer sans fabriquer une donnée officielle", () => {
  assert.match(script, /lykos_fm_match_dossier_v1/);
  assert.match(script, /Brouillon local · à confirmer/);
  assert.match(script, /ne deviennent jamais une donnée officielle/);
  assert.match(script, /data-match-dossier/);
});

test("les données absentes restent explicitement à confirmer", () => {
  assert.match(script, /Date et adversaire à confirmer/);
  assert.match(script, /aucune source médicale fiable/i);
  assert.match(script, /ne transforme jamais une absence de donnée en disponibilité/i);
  assert.doesNotMatch(script, /Math\.random/);
  assert.match(script, /aucun joueur n’est déclaré disponible par défaut/i);
});

test("l’interface est dense mais reste utilisable sur mobile", () => {
  assert.match(styles, /\.fm-lineup-layout/);
  assert.match(styles, /@media\(max-width:780px\)/);
  assert.match(styles, /\.fm-nav\{position:fixed/);
  assert.match(styles, /bottom:max\(12px,env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(styles, /touch-action:manipulation/);
  assert.match(manager, /aria-live="polite"/);
  assert.match(manager, /<dialog/);
});
