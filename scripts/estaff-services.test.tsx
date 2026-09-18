import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import Supervision from "../estaff-src/Supervision";

const html = renderToStaticMarkup(<Supervision sessionToken="test-token" onLogout={() => {}} />);
const source = readFileSync("estaff-src/Supervision.tsx", "utf8");
const css = readFileSync("estaff-src/supervision.module.css", "utf8");

test("Oscar est l’unique interlocuteur affiché", () => {
  assert.ok(html.includes("Quelle mission dois-je piloter ?"));
  assert.ok(html.includes("Canal privé · Oscar uniquement"));
  assert.ok(html.includes("27</strong><span>agents eStaff, Oscar compris"));
  assert.ok(html.includes("26</strong><span>contributeurs mobilisables"));
  assert.ok(!html.includes("Rechercher un agent"));
  for (const name of ["Sophie", "Nadir", "Kostantinos", "Amara", "Jefferson"]) {
    assert.ok(!html.includes(`>${name}<`), name);
  }
});

test("toutes les missions passent techniquement par Oscar", () => {
  assert.match(source, /agent:\s*OSCAR_ID/);
  assert.match(source, /const OSCAR_ID = "oscar"/);
  assert.ok(!source.includes("setIndex"));
  assert.ok(!source.includes("searchAgentGroups"));
});

test("le rapport total exige tous les retours et rend les absences visibles", () => {
  assert.ok(html.includes("Rapport total"));
  assert.ok(source.includes("sollicite tous les agents actifs et autorisés"));
  assert.ok(source.includes("qui est bloqué ou sans réponse"));
  assert.ok(html.includes("Les 26 autres agents peuvent être sollicités par Oscar"));
  assert.ok(html.includes("Oscar attend chaque retour et signale toute absence ou tout blocage"));
});

test("la fraîcheur SportEasy et sa relance sont accessibles en haut de page", () => {
  assert.ok(html.includes("Dernière synchronisation inconnue"));
  assert.ok(html.includes("Relancer maintenant la synchronisation SportEasy"));
  assert.ok(source.includes("Dernière synchronisation il y a ${hours} h"));
  assert.ok(source.includes("ACTION_SYSTÈME PUB2"));
  assert.ok(source.includes("team-data.js?sync_status="));
});

test("les missions longues disposent d’un délai compatible avec une consultation complète", () => {
  assert.match(source, /Date\.now\(\) \+ 720000/);
  assert.ok(source.includes("Oscar coordonne la mission"));
});

test("l’interface reste accessible sur ordinateur et mobile", () => {
  assert.match(css, /@media \(max-width:900px\)/);
  assert.match(css, /@media \(max-width:640px\)/);
  assert.match(css, /grid-template-columns:48px minmax\(0,1fr\)/);
  assert.match(css, /\.status \{ grid-column:2;/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test("les erreurs techniques ne sont jamais présentées aux dirigeants", () => {
  assert.ok(source.includes('error === "read_only"'));
  assert.ok(source.includes("Cette mission ne peut pas être lancée depuis cette interface."));
});
