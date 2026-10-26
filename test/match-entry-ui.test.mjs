import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../",import.meta.url);

test("l'onglet Match appartient à la barre principale du Performance Hub", async () => {
  const [page,estaffPage,home,client,style,hubStyle] = await Promise.all([
    readFile(new URL("index.html",root),"utf8"),
    readFile(new URL("estaff/index.html",root),"utf8"),
    readFile(new URL("estaff/assets/team-home.js",root),"utf8"),
    readFile(new URL("estaff/assets/match-entry.js",root),"utf8"),
    readFile(new URL("estaff/assets/match-entry.css",root),"utf8"),
    readFile(new URL("match-hub.css",root),"utf8"),
  ]);
  assert.match(page,/match-entry\.css\?v=20261025-prematch-v1/);
  assert.match(page,/match-hub\.css\?v=20261026-jeu-v1/);
  assert.match(page,/prematch-insights\.js\?v=20261026-prematch-v5/);
  assert.match(page,/match-entry\.js\?v=20261026-jeu-v1/);
  assert.match(page,/pantheon-data\.js\?v=20261026-prematch-v5/);
  assert.match(page,/data-view="match" data-mobile-label="JEU"/);
  assert.match(client,/Avant Match/);
  assert.match(client,/Après Match/);
  assert.match(client,/Entraînement/);
  assert.match(client,/Plan de jeu/);
  assert.match(client,/coaching\/observation/);
  assert.match(page,/data-view-panel="match"/);
  assert.match(page,/data-match-entry-root/);
  assert.match(page,/\.lykos-headnav \{\s*position:fixed;/);
  assert.match(page,/\.lykos-headnav \{\s*left:0; right:0; bottom:0; width:100%; height:72px/);
  assert.doesNotMatch(estaffPage,/match-entry\.(?:css|js)/);
  assert.doesNotMatch(home,/\["match","Match","Match"\]/);
  assert.match(hubStyle,/\.lykos-match-page/);
  assert.match(hubStyle,/grid-template-areas: "context context" "photo rating" "score score" "approval approval"/);
  assert.match(hubStyle,/grid-auto-columns: 68px/);
  assert.match(client,/class="match-progress"/);
  assert.match(client,/data-match-mode="pre"/);
  assert.match(client,/data-match-mode="post"/);
  assert.match(client,/prematch\/context/);
  assert.match(client,/Groupe confirmé par la convocation Messenger/);
  assert.match(client,/Groupe validé dans le Performance Hub/);
  assert.match(client,/data-prematch-roster-form/);
  assert.match(client,/name="playerIds"/);
  assert.match(client,/prematch\/roster/);
  assert.match(client,/Valider le groupe convoqué/);
  assert.match(client,/au moins 5 joueurs/);
  assert.match(client,/playerIds\.length < 5/);
  assert.match(client,/Pronostic Metron/);
  assert.match(client,/Dernier match du Lykos/);
  assert.match(client,/5 derniers face-à-face/);
  assert.match(client,/5 derniers matchs contre/);
  assert.match(client,/opponentDisplayName/);
  assert.match(client,/class="prematch-ratio"/);
  assert.match(client,/Victoires/);
  assert.match(client,/Défaites/);
  assert.match(client,/class="match-camera-icon"/);
  assert.match(client,/accept="image\/\*,\.heic,\.heif"/);
  assert.doesNotMatch(client,/capture="environment"/);
  assert.match(client,/Galerie ou appareil photo/);
  assert.match(client,/maximum = 2400/);
  assert.match(client,/heic2any-0\.0\.4\.min\.js/);
  assert.match(client,/toType:"image\/jpeg"/);
  assert.match(client,/data-match-scan-retry/);
  assert.match(client,/après deux tentatives/);
  assert.match(client,/Aucune publication automatique/);
  assert.match(client,/J’ai contrôlé le match, le score, tous les buteurs, toutes les passes décisives, toutes les notes et le choix de l’homme du match/);
  assert.match(client,/match-entry\/scan/);
  assert.match(client,/match-entry\/approve/);
  assert.match(client,/Note sur 10/);
  assert.match(client,/\[1,2,3,4,5,6\]/);
  assert.match(client,/type="range"/);
  assert.match(client,/data-match-step-target/);
  assert.match(client,/data-short="Stats"/);
  assert.match(client,/data-match-mvp/);
  assert.match(client,/mvpProfileId/);
  assert.match(client,/name="assist-\$\{player\.id\}"/);
  assert.match(client,/const assists = match\.players\.map/);
  assert.match(client,/goals, assists, playerRatings/);
  assert.doesNotMatch(client,/Voir dans SportEasy/);
  assert.doesNotMatch(client,/<small>Match SportEasy<\/small>/);
  assert.match(client,/goalTotal !== payload\.score\.lykos/);
  assert.match(client,/lykos:hub-session/);
  assert.match(style,/\.match-workflow/);
});

test("la photo reste transitoire et aucune écriture SportEasy ne part avant approbation", async () => {
  const client = await readFile(new URL("estaff/assets/match-entry.js",root),"utf8");
  const scanBlock = client.slice(client.indexOf("async function scan"),client.indexOf("function integer"));
  const submitBlock = client.slice(client.indexOf("async function submit"),client.indexOf('document.addEventListener("click"'));
  assert.doesNotMatch(scanBlock,/match-entry\/approve/);
  assert.match(submitBlock,/match-entry\/approve/);
  assert.match(client,/La photo est transmise de façon temporaire pour être lue, puis n’est pas conservée/);
  assert.doesNotMatch(client,/localStorage|sessionStorage|indexedDB/);
});
