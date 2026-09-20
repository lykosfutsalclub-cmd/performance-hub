import test from "node:test";
import assert from "node:assert/strict";
import {
  determineScheduleMission,
  latestSportEasySyncSlot,
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

test("le contrôle horaire reprend une échéance dont le créneau GitHub a été manqué", () => {
  const recovered = determineScheduleMission({
    ...authorized,
    eventName: "schedule",
    scheduledCron: "37 * * * *",
    observedAt: "2026-09-20T08:37:00Z",
  });

  assert.equal(recovered.sync, true);
  assert.equal(recovered.active, true);
  assert.equal(recovered.catchUp, true);
  assert.equal(recovered.slot, "sporteasy-sync:2026-09-20");
  assert.equal(recovered.nominalAt, "2026-09-20T08:07:00.000Z");
});

test("une échéance manquée reste due après minuit tant qu’aucune preuve n’existe", () => {
  const outstanding = determineScheduleMission({
    ...authorized,
    eventName: "schedule",
    scheduledCron: "37 * * * *",
    observedAt: "2026-09-21T00:37:00Z",
  });

  assert.equal(outstanding.sync, true);
  assert.equal(outstanding.slot, "sporteasy-sync:2026-09-20");
});

test("la preuve de fin empêche le contrôle horaire et le cron retardé de rejouer le même jour", () => {
  const completedSyncSlots = ["sporteasy-sync:2026-09-20"];
  const hourly = determineScheduleMission({
    ...authorized,
    completedSyncSlots,
    eventName: "schedule",
    scheduledCron: "37 * * * *",
    observedAt: "2026-09-20T12:37:00Z",
  });
  const delayedDaily = determineScheduleMission({
    ...authorized,
    completedSyncSlots,
    eventName: "schedule",
    scheduledCron: "7 8 * * *",
    observedAt: "2026-09-20T15:42:00Z",
  });

  for (const decision of [hourly, delayedDaily]) {
    assert.equal(decision.sync, false);
    assert.equal(decision.active, false);
    assert.equal(decision.alreadyCompleted, true);
    assert.equal(decision.slot, "sporteasy-sync:2026-09-20");
  }
});

test("une synchronisation manuelle peut sceller l’échéance quotidienne déjà due", () => {
  const manual = determineScheduleMission({
    ...authorized,
    eventName:"workflow_dispatch",
    observedAt:"2026-09-20T12:00:00Z",
  });
  const earlyManual = determineScheduleMission({
    ...authorized,
    completedSyncSlots:["sporteasy-sync:2026-09-19"],
    eventName:"workflow_dispatch",
    observedAt:"2026-09-20T06:00:00Z",
  });

  assert.equal(manual.slot,"manual");
  assert.equal(manual.proofSlot,"sporteasy-sync:2026-09-20");
  assert.equal(earlyManual.proofSlot,null);
});

test("aucune preuve n’est promise lorsque la synchronisation nominative est interdite", () => {
  const denied = determineScheduleMission({
    eventName:"workflow_dispatch",
    observedAt:"2026-09-20T12:00:00Z",
    individualPublicationAuthorized:false,
  });
  assert.equal(denied.sync,false);
  assert.equal(denied.proofSlot,null);
});

test("un échec ne bloque pas le prochain contrôle horaire tant que la preuve manque", () => {
  for (const observedAt of ["2026-09-20T12:37:00Z", "2026-09-20T13:37:00Z"]) {
    const hourlyControl = determineScheduleMission({
      ...authorized,
      eventName:"schedule",
      scheduledCron:"37 * * * *",
      observedAt,
    });

    assert.equal(hourlyControl.sync,true);
    assert.equal(hourlyControl.active,true);
    assert.equal(hourlyControl.catchUp,true);
    assert.equal(hourlyControl.slot,"sporteasy-sync:2026-09-20");
    assert.equal(hourlyControl.proofSlot,"sporteasy-sync:2026-09-20");
  }
});

test("le rattrapage sélectionne une seule échéance à 10 h en été comme en hiver", () => {
  for (const [observedAt, nominalAt] of [
    ["2026-09-20T12:37:00Z", "2026-09-20T08:07:00.000Z"],
    ["2026-12-20T12:37:00Z", "2026-12-20T09:07:00.000Z"],
    ["2026-03-29T12:37:00Z", "2026-03-29T08:07:00.000Z"],
    ["2026-10-25T12:37:00Z", "2026-10-25T09:07:00.000Z"],
  ]) {
    assert.equal(latestSportEasySyncSlot(observedAt)?.nominalAt, nominalAt);
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
  const hourly = determineScheduleMission({
    ...authorized,
    completedSyncSlots:["sporteasy-sync:2026-09-20"],
    eventName: "schedule",
    scheduledCron: "37 * * * *",
    observedAt:"2026-09-20T12:37:00Z",
  });

  assert.deepEqual([manual.active, manual.sync, manual.oscar, manual.mode], [true, true, true, "manual"]);
  assert.deepEqual([release.active, release.sync, release.oscar, release.mode], [true, false, false, "release"]);
  assert.deepEqual([forced.active, forced.sync, forced.oscar, forced.mode], [true, true, false, "manual"]);
  assert.deepEqual([hourly.active, hourly.sync, hourly.oscar], [false, false, false]);
});

test("une expression non quotidienne n’est pas reconstituée comme une échéance", () => {
  assert.equal(nominalOccurrence("17 6 * * 1,4", "2026-09-20T12:00:00Z"), null);
});
