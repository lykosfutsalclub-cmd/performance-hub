import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("le Performance Hub autorise le zoom du navigateur", async () => {
  const page = await readFile(new URL("index.html", root), "utf8");
  assert.match(page, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.doesNotMatch(page, /user-scalable=no|maximum-scale=1/);
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
