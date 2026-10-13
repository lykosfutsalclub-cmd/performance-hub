import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../",import.meta.url);

test("le service administratif porte partout le nom eAdministration", async () => {
  const files = await Promise.all([
    readFile(new URL("index.html",root),"utf8"),
    readFile(new URL("estaff/assets/esupport-report.js",root),"utf8"),
    readFile(new URL("estaff/assets/team-home.js",root),"utf8"),
    readFile(new URL("five-manager/five-manager.js",root),"utf8"),
  ]);
  for (const source of files) {
    assert.doesNotMatch(source,/eOpérations|eOperations/u);
  }
  assert.match(files[0],/<h4>eAdministration<\/h4>/u);
  assert.match(files[1],/operations:"eAdministration"/u);
  assert.match(files[2],/operations:\{label:"eAdministration",short:"Administration"\}/u);
  assert.match(files[3],/\['eAdministration', 'sophie'/u);
});
