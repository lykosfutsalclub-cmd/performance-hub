import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("toutes les surfaces du Performance Hub verrouillent le zoom", async () => {
  const pages = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("estaff/index.html", root), "utf8"),
    readFile(new URL("five-manager/index.html", root), "utf8"),
  ]);

  for (const page of pages) {
    assert.match(page, /minimum-scale=1/);
    assert.match(page, /maximum-scale=1/);
    assert.match(page, /user-scalable=no/);
    assert.match(page, /viewport-lock\.css\?v=20261027-v1/);
    assert.match(page, /viewport-lock\.js\?v=20261027-v1/);
  }
});

test("la protection mobile neutralise les gestes et raccourcis de zoom", async () => {
  const [style, script] = await Promise.all([
    readFile(new URL("viewport-lock.css", root), "utf8"),
    readFile(new URL("viewport-lock.js", root), "utf8"),
  ]);

  assert.match(style, /touch-action: pan-x pan-y/);
  assert.match(style, /width: 100dvw !important/);
  assert.match(style, /#lykos-dashboard-preview,[\s\S]*?#estaff-root,[\s\S]*?#five-manager-app/);
  assert.match(script, /gesturestart/);
  assert.match(script, /event\.touches\.length > 1/);
  assert.match(script, /dblclick/);
  assert.match(script, /event\.ctrlKey \|\| event\.metaKey/);
});
