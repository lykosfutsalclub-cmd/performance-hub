import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("le Performance Hub verrouille le cadrage mobile", async () => {
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(page, /name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"/);
});

test("la porte d’accès est annoncée comme une fenêtre et reçoit le focus", async () => {
  const [gate, styles] = await Promise.all([
    readFile(new URL("access-gate.js", root), "utf8"),
    readFile(new URL("access-gate.css", root), "utf8"),
  ]);
  assert.match(gate, /gate\.setAttribute\("role", "dialog"\)/);
  assert.match(gate, /gate\.setAttribute\("aria-modal", "true"\)/);
  assert.match(gate, /keypad\.querySelector\("button"\)\?\.focus\(\)/);
  assert.match(styles, /width: min\(410px, calc\(100vw - 36px\)\)/);
  assert.match(styles, /@media \(max-width: 360px\)/);
});

test("la navigation eStaff reste visible et remonte après le rendu", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("estaff/assets/team-home.js", root), "utf8"),
    readFile(new URL("estaff/assets/team-home.css", root), "utf8"),
  ]);
  assert.match(client, /function renderThenScrollToStart\(\)\{scheduleRender\(\);requestAnimationFrame\(scrollToPageStart\);\}/);
  assert.match(client, /aria-pressed="\$\{currentView===key\}"/);
  assert.match(styles, /@media \(max-width:860px\) \{[\s\S]*?\.company-topbar \{position:sticky;top:0;/);
});

test("les fenêtres eStaff reprennent le focus et gardent des actions tactiles", async () => {
  const [client, styles] = await Promise.all([
    readFile(new URL("estaff/assets/team-home.js", root), "utf8"),
    readFile(new URL("estaff/assets/team-home.css", root), "utf8"),
  ]);
  assert.match(client, /function focusOpenDialog\(\).*?profile-close.*?\.focus\(\)/);
  assert.match(styles, /\.profile-close \{[^}]*width:44px;height:44px;/);
  assert.match(styles, /:focus-visible \{outline:3px solid #f3d52b;/);
});

test("le détail des matchs reste sous le graphique et toutes ses lignes restent accessibles", async () => {
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(page, /\.lykos-team-score-card \{[^}]*overflow:hidden;/);
  assert.match(page, /\.lykos-score-popover \{[^}]*position:relative;[^}]*width:100%;[^}]*overflow:hidden;/);
  assert.match(page, /\.lykos-score-match-list \{[^}]*max-height:min\(240px,38dvh\);[^}]*overflow-y:auto;/);
  assert.match(page, /data-score-popover id="lykos-score-details" role="region" aria-labelledby="lykos-score-details-title"/);
  assert.match(page, /bin\.setAttribute\('aria-controls','lykos-score-details'\)/);
  assert.doesNotMatch(page, /cardBox = anchor\.closest\('\.lykos-team-score-card'\)/);
});

test("les joueurs actuels et anciens sont différenciés et filtrables sans perdre la recherche", async () => {
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(page, /data-player-status-filter="all" aria-pressed="true">Tous<\/button>/);
  assert.match(page, /data-player-status-filter="current" aria-pressed="false">Actuels<\/button>/);
  assert.match(page, /data-player-status-filter="former" aria-pressed="false">Anciens<\/button>/);
  assert.match(page, /\.lykos-nav button\[data-current="false"\] \{[^}]*opacity:\.56;[^}]*filter:saturate\(\.22\);/);
  assert.match(page, /\.lykos-player-choice\[data-current="false"\] \{[^}]*opacity:\.58;[^}]*filter:saturate\(\.22\);/);
  assert.match(page, /const matchesPlayerStatus = player => playerStatusFilter === 'all'/);
  assert.match(page, /matchesPlayerStatus\(player\) && normalizePlayerSearch\(player\.name\)\.includes\(search\)/);
  assert.match(page, /data-player-list-empty role="status" hidden/);
});

test("les détails de comparaison restent dans la page au-dessus de la navigation fixe", async () => {
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(page, /\.lykos-comparison-popover \{[^}]*position:relative;[^}]*width:100%;[^}]*margin-top:12px;/);
  assert.match(page, /data-comparison-popover id="lykos-comparison-details" role="region" aria-labelledby="lykos-comparison-details-title"/);
  assert.match(page, /'aria-controls':'lykos-comparison-details'/);
  assert.doesNotMatch(page, /comparisonPopover\.hidden = false; placeFixedPopover\(comparisonPopover,anchor\)/);
});

test("chaque rond de forme récente expose le match au survol, au toucher et au clavier", async () => {
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(page, /data-team-form-popover id="lykos-team-form-details" role="region" aria-labelledby="lykos-team-form-details-title"/);
  assert.match(page, /const item = document\.createElement\('button'\);/);
  assert.match(page, /item\.setAttribute\('aria-controls','lykos-team-form-details'\)/);
  assert.match(page, /item\.addEventListener\('mouseenter'/);
  assert.match(page, /scoreDistribution\.flatMap\(entry => Array\.isArray\(entry\?\.fixtures\)/);
  assert.match(page, /renderTeamForm\(panel\.querySelector\('\[data-team-form\]'\),values\.recentResults,values\.scoreDistribution\)/);
});
