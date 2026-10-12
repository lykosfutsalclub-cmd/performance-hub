import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../",import.meta.url);

test("le Performance Hub propose une actualisation par glissement sur écran tactile", async () => {
  const [page,estaffPage,fiveManagerPage,script,style] = await Promise.all([
    readFile(new URL("index.html",root),"utf8"),
    readFile(new URL("estaff/index.html",root),"utf8"),
    readFile(new URL("five-manager/index.html",root),"utf8"),
    readFile(new URL("pull-refresh.js",root),"utf8"),
    readFile(new URL("pull-refresh.css",root),"utf8"),
  ]);

  assert.match(page,/pull-refresh\.css\?v=20261012-pull-refresh-v1/);
  assert.match(page,/pull-refresh\.js\?v=20261012-pull-refresh-v1/);
  assert.match(estaffPage,/\.\.\/pull-refresh\.css\?v=20261012-pull-refresh-v1/);
  assert.match(estaffPage,/\.\.\/pull-refresh\.js\?v=20261012-pull-refresh-v1/);
  assert.match(fiveManagerPage,/\.\.\/pull-refresh\.css\?v=20261012-pull-refresh-v1/);
  assert.match(fiveManagerPage,/\.\.\/pull-refresh\.js\?v=20261012-pull-refresh-v1/);
  assert.match(script,/const THRESHOLD = 78/);
  assert.match(script,/const pageIsAtTop/);
  assert.match(script,/lykos-access-locked/);
  assert.match(script,/touchmove/);
  assert.match(script,/\{passive:false\}/);
  assert.match(script,/window\.location\.reload\(\)/);
  assert.match(script,/Aaaooouuuuuuuu 🐺\(ça charge, sois patient…\)/);
  assert.match(style,/\.lykos-pull-refresh\.is-refreshing/);
  assert.match(style,/env\(safe-area-inset-top\)/);
  assert.match(style,/@media \(prefers-reduced-motion: reduce\)/);
});
