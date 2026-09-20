import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLICATION_FILES,
  neutralizeGeneratedAt,
  selectPublicationSet,
} from "../scripts/estaff/publication-selection.mjs";

function set({stamp = "2026-09-20T01:00:00.000Z", suffix = "stable"} = {}) {
  return Object.fromEntries(PUBLICATION_FILES.map((file) => [
    file,
    `window.DATA={"generatedAt":"${stamp}","file":"${file}","value":"${suffix}"};\n`,
  ]));
}

test("une évolution concurrente du code, sans évolution des données, conserve le lot validé", () => {
  const base = set();
  const validated = set({stamp: "2026-09-20T02:00:00.000Z", suffix: "nouveau"});
  assert.equal(selectPublicationSet(base, validated, {...base}), "validated");
});

test("un lot concurrent identique et plus récent est accepté sans nouvelle publication", () => {
  const base = set();
  const validated = set({stamp: "2026-09-20T02:00:00.000Z", suffix: "nouveau"});
  const current = set({stamp: "2026-09-20T03:00:00.000Z", suffix: "nouveau"});
  assert.equal(selectPublicationSet(base, validated, current), "current");
});

test("une évolution concurrente partielle des données est refusée", () => {
  const base = set();
  const validated = set({stamp: "2026-09-20T02:00:00.000Z", suffix: "nouveau"});
  const current = {...base, [PUBLICATION_FILES[0]]: validated[PUBLICATION_FILES[0]]};
  assert.throws(() => selectPublicationSet(base, validated, current), /concurrente partielle/);
});

test("un lot concurrent au contenu métier différent est refusé", () => {
  const base = set();
  const validated = set({stamp: "2026-09-20T02:00:00.000Z", suffix: "nouveau"});
  const current = set({stamp: "2026-09-20T03:00:00.000Z", suffix: "différent"});
  assert.throws(() => selectPublicationSet(base, validated, current), /concurrente divergente/);
});

test("un lot concurrent identique mais plus ancien est refusé", () => {
  const base = set({stamp: "2026-09-20T00:00:00.000Z"});
  const validated = set({stamp: "2026-09-20T03:00:00.000Z", suffix: "nouveau"});
  const current = set({stamp: "2026-09-20T02:00:00.000Z", suffix: "nouveau"});
  assert.throws(() => selectPublicationSet(base, validated, current), /plus ancien/);
});

test("seul generatedAt est neutralisé pour comparer deux lots", () => {
  assert.equal(
    neutralizeGeneratedAt('{"generatedAt":"2026-01-01T00:00:00Z","value":1}'),
    '{"generatedAt":"<horodatage>","value":1}',
  );
  assert.notEqual(
    neutralizeGeneratedAt('{"generatedAt":"2026-01-01T00:00:00Z","value":1}'),
    neutralizeGeneratedAt('{"generatedAt":"2026-01-01T00:00:00Z","value":2}'),
  );
});
