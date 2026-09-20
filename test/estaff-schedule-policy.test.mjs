import test from "node:test";
import assert from "node:assert/strict";
import {
  determineScheduleMission,
  nominalOccurrence,
  resolveParisSlot,
} from "../scripts/estaff/schedule-policy.mjs";

const authorized = {individualPublicationAuthorized: true};

test("la synchronisation d’été reste due lorsque GitHub démarre plusieurs heures en retard", () => {
  const delayed = determineScheduleMission({
    ...authorized,
    eventName: "schedule",
    scheduledCron: "7 8 * * *",
    observedAt: "2026-09-20T15:42:00Z",
  });

  assert.equal(delayed.sync, true);
  assert.equal(delayed.active, true);
  assert.equal(delayed.slot, "sporteasy-sync:2026-09-20");
  assert.equal(delayed.nominalAt, "2026-09-20T08:07:00.000Z");
});

test("un retard passant minuit conserve l’échéance de la veille", () => {
  const delayed = determineScheduleMission({
    ...authorized,
    eventName: "schedule",
    scheduledCron: "7 8 * * *",
    observedAt: "2026-09-21T00:30:00Z",
  });

  assert.equal(delayed.sync, true);
  assert.equal(delayed.slot, "sporteasy-sync:2026-09-20");
  assert.equal(delayed.nominalAt, "2026-09-20T08:07:00.000Z");
});

test("un seul des deux créneaux UTC porte l’échéance quotidienne", () => {
  for (const [season, observedAt, expectedCron] of [
    ["été", "2026-09-20T12:00:00Z", "7 8 * * *"],
    ["hiver", "2026-12-20T12:00:00Z", "7 9 * * *"],
  ]) {
    const decisions = ["7 8 * * *", "7 9 * * *"].map(scheduledCron => determineScheduleMission({
      ...authorized,
      eventName: "schedule",
      scheduledCron,
      observedAt,
    }));
    assert.equal(decisions.filter(decision => decision.sync).length, 1, season);
    assert.equal(decisions.find(decision => decision.sync)?.nominalAt.includes(expectedCron === "7 8 * * *" ? "T08:07" : "T09:07"), true, season);
  }
});

test("le rapport Oscar reste dû après un démarrage tardif et sans lancer SportEasy", () => {
  const delayed = determineScheduleMission({
    ...authorized,
    eventName: "schedule",
    scheduledCron: "30 9 * * *",
    observedAt: "2026-09-20T19:00:00Z",
  });

  assert.equal(delayed.oscar, true);
  assert.equal(delayed.sync, false);
  assert.equal(delayed.slot, "oscar-brief:2026-09-20");
});

test("le créneau UTC doublon est ignoré selon l’heure de Paris", () => {
  assert.equal(resolveParisSlot("7 9 * * *", {hour: 10, observedAt: "2026-09-20T15:00:00Z"}), null);
  assert.equal(resolveParisSlot("30 10 * * *", {hour: 11, minute: 30, observedAt: "2026-09-20T15:00:00Z"}), null);
});

test("une synchronisation nominative reste bloquée sans preuve d’autorisation", () => {
  const denied = determineScheduleMission({
    eventName: "schedule",
    scheduledCron: "7 8 * * *",
    observedAt: "2026-09-20T12:00:00Z",
    individualPublicationAuthorized: false,
  });

  assert.equal(denied.syncRequested, true);
  assert.equal(denied.sync, false);
});

test("les déclenchements manuel, push et horaire conservent leurs périmètres", () => {
  const manual = determineScheduleMission({...authorized, eventName: "workflow_dispatch"});
  const release = determineScheduleMission({...authorized, eventName: "push", commitMessage: "mise à jour visuelle"});
  const forced = determineScheduleMission({...authorized, eventName: "push", commitMessage: "[esupport-sync] données"});
  const hourly = determineScheduleMission({...authorized, eventName: "schedule", scheduledCron: "37 * * * *"});

  assert.deepEqual([manual.active, manual.sync, manual.oscar, manual.mode], [true, true, true, "manual"]);
  assert.deepEqual([release.active, release.sync, release.oscar, release.mode], [true, false, false, "release"]);
  assert.deepEqual([forced.active, forced.sync, forced.oscar, forced.mode], [true, true, false, "manual"]);
  assert.deepEqual([hourly.active, hourly.sync, hourly.oscar], [false, false, false]);
});

test("une expression non quotidienne n’est pas reconstituée comme une échéance", () => {
  assert.equal(nominalOccurrence("17 6 * * 1,4", "2026-09-20T12:00:00Z"), null);
});
