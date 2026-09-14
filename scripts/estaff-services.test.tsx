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
  assert.ok(html.includes("18</strong><span>spécialistes mobilisables"));
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
  assert.ok(html.includes("Oscar attend chaque retour et signale toute absence ou tout blocage"));
});

test("les missions longues disposent d’un délai compatible avec une consultation complète", () => {
  assert.match(source, /Date\.now\(\) \+ 720000/);
  assert.ok(source.includes("Oscar coordonne la mission"));
});

test("l’interface reste accessible sur ordinateur et mobile", () => {
  assert.match(css, /@media \(max-width:900px\)/);
  assert.match(css, /@media \(max-width:640px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
