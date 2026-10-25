import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("../estaff/assets/prematch-insights.js",import.meta.url),"utf8");

function api() {
  const window = {};
  vm.runInNewContext(source,{window,document:{querySelectorAll:() => []},Date});
  return window.LykosPrematchInsights;
}

const teamStats = {
  periods:{current:{form:{value:80}}},
  seasons:[{label:"2026-2027",series:[
    {date:"2026-10-12",opponent:"Pélissanne Loisir",score:"27–3",teamForm:82},
    {date:"2026-09-08",opponent:"ASE",score:"12–10",teamForm:70},
    {date:"2025-02-02",opponent:"ASE",score:"8–12",teamForm:40},
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
  const result = insights.forecast(context,teamStats,secondary,directory,new Date("2026-10-25T12:00:00Z"));
  assert.equal(result.value,72.5);
  assert.equal(result.confidence,"élevée");
  assert.equal(result.provisional,false);
  assert.equal(result.headToHead.value,55);
});

test("le dernier match et le dernier face-à-face sont distingués", () => {
  const insights = api();
  const result = insights.history({opponent:"ASE"},teamStats,new Date("2026-10-25T12:00:00Z"));
  assert.equal(result.lastMatch.opponent,"Pélissanne Loisir");
  assert.equal(result.lastAgainst.date,"2026-09-08");
});
