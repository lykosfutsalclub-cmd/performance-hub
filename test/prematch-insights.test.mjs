import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("../estaff/assets/prematch-insights.js",import.meta.url),"utf8");
const publicPantheonSource = await readFile(new URL("../pantheon-data.js",import.meta.url),"utf8");

function api() {
  const window = {};
  vm.runInNewContext(source,{window,document:{querySelectorAll:() => []},Date});
  return window.LykosPrematchInsights;
}

const teamStats = {
  periods:{current:{form:{value:80}}},
  seasons:[{label:"2026-2027",series:[
    {date:"2026-10-12",opponent:"Pélissanne Loisir",score:"27–3",teamForm:82},
    {date:"2026-09-08",opponent:"ASE Foot Cinq",score:"12–10",teamForm:70},
    {date:"2026-05-25",opponent:"ASE FOOT 5",score:"9–8",teamForm:60},
    {date:"2025-09-08",opponent:"ASE Foot 1",score:"10–10",teamForm:50},
    {date:"2025-02-02",opponent:"ASE 1",score:"8–12",teamForm:40},
    {date:"2024-02-02",opponent:"ASE",score:"6–12",teamForm:30},
    {date:"2026-06-29",opponent:"SABA Futsal",score:"8–7",teamForm:65},
  ]}],
};
const secondary = {periods:{current:{players:{
  "joueur-a":{performance:{overall:70}},
  "joueur-b":{performance:{overall:80}},
  "joueur-c":{performance:{overall:null}},
}}}};
const directory = [
  {id:"joueur-a",name:"Joueur A",normalized:"joueur a"},
  {id:"joueur-b",name:"Joueur B",normalized:"joueur b"},
  {id:"joueur-c",name:"Joueur C",normalized:"joueur c"},
];
const pantheon = {recordScopes:{match:[
  {date:"2026-10-12",opponentName:"Pélissanne Loisir",players:{"joueur-a":{goals:2,assists:1,averageRating:8,ratedMatches:1},"joueur-b":{goals:0,assists:1,averageRating:6,ratedMatches:1}}},
  {date:"2026-09-08",opponentName:"ASE Foot Cinq",players:{"joueur-a":{goals:3,assists:1,averageRating:9,ratedMatches:1},"joueur-b":{goals:1,assists:0,averageRating:7,ratedMatches:1}}},
  {date:"2026-05-25",opponentName:"ASE FOOT 5",players:{"joueur-a":{goals:1,assists:0,averageRating:7,ratedMatches:1}}},
  {date:"2025-09-08",opponentName:"ASE Foot 1",players:{"joueur-a":{goals:0,assists:1,averageRating:6,ratedMatches:1},"joueur-b":{goals:2,assists:1,averageRating:8,ratedMatches:1}}},
  {date:"2025-02-02",opponentName:"ASE 1",players:{"joueur-a":{goals:1,assists:1,averageRating:null,ratedMatches:0},"joueur-b":{goals:0,assists:0,averageRating:7,ratedMatches:1}}},
  {date:"2024-02-02",opponentName:"ASE",players:{"joueur-b":{goals:1,assists:0,averageRating:6,ratedMatches:1}}},
]}};

test("le pré-match rapproche le groupe et les Metron sans inventer les données manquantes", () => {
  const insights = api();
  const result = insights.rosterMetron({players:[{name:"Joueur A"},{name:"Joueur B"},{name:"Joueur C"},{name:"Inconnu"}]},secondary,directory);
  assert.equal(result.average,75);
  assert.equal(result.coverage.available,2);
  assert.equal(result.coverage.total,4);
  assert.equal(result.players[2].metron,null);
  assert.equal(result.players[3].metron,null);
});

test("le pronostic Metron combine groupe, forme et face-à-face avec une formule traçable", () => {
  const insights = api();
  const context = {match:{opponent:"ASE"},roster:{confirmation:"confirmed",players:[{name:"Joueur A"},{name:"Joueur B"}]}};
  const result = insights.forecast(context,teamStats,secondary,directory,pantheon,new Date("2026-10-25T12:00:00Z"));
  assert.equal(result.value,67.4);
  assert.equal(result.confidence,"élevée");
  assert.equal(result.provisional,false);
  assert.equal(result.headToHead.value,50);
  assert.equal(result.headToHead.matches.length,5);
  assert.equal(result.evidence.opponentMatches.length,5);
  assert.equal(result.squad.players[0].recent.averageRating,7.5);
  assert.equal(result.squad.players[0].opponent.goals,5);
});

test("le dernier match et le dernier face-à-face sont distingués", () => {
  const insights = api();
  const result = insights.history({opponent:"ASE"},teamStats,new Date("2026-10-25T12:00:00Z"));
  assert.equal(result.lastMatch.opponent,"Pélissanne Loisir");
  assert.equal(result.lastAgainst.date,"2026-09-08");
  assert.equal(result.againstMatches.length,5);
  assert.equal(result.recentMatches.length,5);
});

test("les variantes ASE sont un seul adversaire et SABA reste un adversaire distinct", () => {
  const insights = api();
  for (const name of ["ASE Foot Cinq","ASE Foot 5","ASE Foot 1","ASE 1","ASE","ASE Foot 5 - Lykos F.C"]) assert.equal(insights.opponentIdentity(name),"ase");
  for (const name of ["SABA Foot 5","SABA Futsal","SABA"]) assert.equal(insights.opponentIdentity(name),"saba");
  assert.notEqual(insights.opponentIdentity("ASE Foot 5"),insights.opponentIdentity("SABA Foot 5"));
});

test("le titre SportEasy est nettoyé avant affichage et rapprochement", () => {
  const insights = api();
  assert.equal(insights.opponentDisplayName("ASE Foot 5 - Lykos F.C"),"ASE Foot 5");
  assert.equal(insights.opponentDisplayName("Lykos FC vs ALL STARS"),"ALL STARS");
  const result = insights.history({opponent:"ASE Foot 5 - Lykos F.C"},teamStats,new Date("2026-10-25T12:00:00Z"));
  assert.equal(result.againstMatches.length,5);
});

test("le ratio des cinq face-à-face reflète les résultats réels", () => {
  const insights = api();
  const matches = insights.history({opponent:"ASE"},teamStats,new Date("2026-10-25T12:00:00Z")).againstMatches;
  assert.equal(JSON.stringify(insights.resultBreakdown(matches)),JSON.stringify({matches:5,wins:2,draws:1,losses:2}));
});

test("les notes SportEasy nécessaires au pronostic sont présentes dans les données publiques", () => {
  const context = {window:{}};
  vm.runInNewContext(publicPantheonSource,context);
  const matches = context.window.LYKOS_PANTHEON_STATS.recordScopes.match;
  assert.ok(matches.length >= 150,"l'historique public existant doit être conservé");
  assert.ok(matches.some((match) => Object.values(match.players ?? {}).some((player) => Number.isFinite(player.averageRating))));
});

test("le cas public ASE retrouve bien l'historique collectif et individuel", async () => {
  const insights = api();
  const teamContext = {window:{}};
  vm.runInNewContext(await readFile(new URL("../team-data.js",import.meta.url),"utf8"),teamContext);
  const pantheonContext = {window:{}};
  vm.runInNewContext(publicPantheonSource,pantheonContext);
  const history = insights.history({opponent:"ASE Foot 5 - Lykos F.C"},teamContext.window.LYKOS_TEAM_STATS,new Date("2026-10-26T12:00:00Z"));
  assert.equal(history.againstMatches.length,5);
  assert.ok(history.againstMatches.every((match) => insights.opponentIdentity(match.opponent) === "ase"));
  const evidence = insights.playerEvidence({players:[{id:"joueur-guillaume-dato",name:"Guillaume Dato"}]},"ASE Foot 5 - Lykos F.C",pantheonContext.window.LYKOS_PANTHEON_STATS,new Date("2026-10-26T12:00:00Z"));
  assert.equal(evidence.opponentMatches.length,5);
  assert.ok(evidence.players[0].opponent.matches > 0);
  assert.ok(Number.isFinite(evidence.players[0].opponent.score));
});
