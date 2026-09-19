import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("la barre principale reste visible pendant le défilement", () => {
  assert.match(page, /@media \(min-width: 781px\) \{[\s\S]*?\.lykos-headbar \{[^}]*position:fixed;[^}]*top:0;[^}]*left:0;[^}]*right:0;[^}]*z-index:40;/);
  assert.match(page, /@media \(min-width: 781px\) \{[\s\S]*?\.lykos-shell \{ padding-top:72px; \}/);
});

test("un changement d’onglet replace la page en haut", () => {
  assert.match(page, /const scrollToViewStart = \(\) => \{/);
  assert.match(page, /scrollingElement\.scrollTop = 0;/);
  assert.match(page, /window\.scrollTo\(\{top:0,left:0,behavior:'auto'\}\);/);
  assert.match(page, /requestAnimationFrame\(scrollToViewStart\);/);
});
