import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicPlayerIdMap, publicMatchId, publicPlayerId, publicSeasonId } from "../src/privacy/public-identifiers.mjs";

test("les identifiants publics ne reprennent pas les identifiants SportEasy", () => {
  assert.equal(publicPlayerId("Élise D'Arc"), "joueur-elise-d-arc");
  assert.equal(publicSeasonId("2026-2027"), "saison-2026-2027");
  assert.equal(publicMatchId({date:"2026-09-18", opponent:"FC Lançon"}), "match-2026-09-18-fc-lancon");
});

test("la table publique relie un identifiant source à un libellé sportif", () => {
  const mapping = buildPublicPlayerIdMap([{sporteasyId:"1234567", displayName:"Joueur Test"}]);
  assert.equal(mapping.get("1234567"), "joueur-joueur-test");
  assert.equal([...mapping.values()].some((value) => value.includes("1234567")), false);
});

test("une collision de noms bloque la publication", () => {
  assert.throws(() => buildPublicPlayerIdMap([
    {sporteasyId:"1", displayName:"Élise"},
    {sporteasyId:"2", displayName:"Elise"},
  ]), /conflit/);
});
