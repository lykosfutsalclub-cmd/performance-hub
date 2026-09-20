const PARIS_TIME_ZONE = "Europe/Paris";

export const SPORTEASY_SYNC_CRONS = Object.freeze([
  "7 8 * * *",
  "7 9 * * *",
]);

export const OSCAR_BRIEF_CRONS = Object.freeze([
  "30 9 * * *",
  "30 10 * * *",
]);

export const ESUPPORT_DIGEST_CRON = "17 6 * * 1,4";
export const HOURLY_RECOVERY_CRON = "37 * * * *";

const parisFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PARIS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parseDailyCron(cron) {
  const match = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(cron);
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute > 59 || hour > 23) return null;
  return {minute, hour};
}

function parisParts(date) {
  return Object.fromEntries(
    parisFormatter.formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)]),
  );
}

/**
 * Reconstitue l'occurrence UTC nominale du cron la plus récente.
 *
 * GitHub peut démarrer un workflow longtemps après son heure planifiée. La
 * décision se fonde donc sur l'heure portée par le cron, jamais sur l'heure de
 * démarrage effective du runner.
 */
export function nominalOccurrence(cron, observedAt = new Date()) {
  const parsed = parseDailyCron(cron);
  if (!parsed) return null;

  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) throw new TypeError("Date d’observation invalide.");

  const nominal = new Date(Date.UTC(
    observed.getUTCFullYear(),
    observed.getUTCMonth(),
    observed.getUTCDate(),
    parsed.hour,
    parsed.minute,
  ));

  if (nominal.getTime() > observed.getTime()) nominal.setUTCDate(nominal.getUTCDate() - 1);
  return nominal;
}

export function resolveParisSlot(cron, {hour, minute = null, observedAt = new Date()} = {}) {
  const nominal = nominalOccurrence(cron, observedAt);
  if (!nominal) return null;

  const parts = parisParts(nominal);
  if (parts.hour !== hour || (minute !== null && parts.minute !== minute)) return null;

  return {
    cron,
    nominalAt: nominal.toISOString(),
    parisDate: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
  };
}

/**
 * Retrouve la dernière échéance SportEasy qui aurait dû commencer avant
 * l'instant observé. Une seule des deux expressions UTC correspond à 10 h à
 * Paris, y compris lors des changements d'heure.
 */
export function latestSportEasySyncSlot(observedAt = new Date()) {
  const candidates = SPORTEASY_SYNC_CRONS
    .map((cron) => resolveParisSlot(cron, {hour: 10, observedAt}))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.nominalAt) - Date.parse(left.nominalAt));
  return candidates[0] ?? null;
}

function syncSlotKey(slot) {
  return slot ? `sporteasy-sync:${slot.parisDate}` : null;
}

export function determineScheduleMission({
  eventName,
  commitMessage = "",
  scheduledCron = "",
  observedAt = new Date(),
  individualPublicationAuthorized = false,
  completedSyncSlots = [],
  suspendedSyncSlots = [],
} = {}) {
  const isManual = eventName === "workflow_dispatch";
  const isPush = eventName === "push";
  const requestedSyncPush = isPush && /\[esupport-sync\]/i.test(commitMessage);

  const scheduledSyncSlot = SPORTEASY_SYNC_CRONS.includes(scheduledCron)
    ? resolveParisSlot(scheduledCron, {hour: 10, observedAt})
    : null;
  const recoverySyncSlot = scheduledCron === HOURLY_RECOVERY_CRON
    ? latestSportEasySyncSlot(observedAt)
    : null;
  const candidateSyncSlot = scheduledSyncSlot ?? recoverySyncSlot;
  const candidateSyncKey = syncSlotKey(candidateSyncSlot);
  const completed = new Set(
    Array.isArray(completedSyncSlots)
      ? completedSyncSlots.filter((slot) => /^sporteasy-sync:\d{4}-\d{2}-\d{2}$/.test(slot))
      : [],
  );
  const suspendedSlots = new Set(
    Array.isArray(suspendedSyncSlots)
      ? suspendedSyncSlots.filter((slot) => /^sporteasy-sync:\d{4}-\d{2}-\d{2}$/.test(slot))
      : [],
  );
  const alreadyCompleted = candidateSyncKey ? completed.has(candidateSyncKey) : false;
  const suspended = candidateSyncKey
    ? suspendedSlots.has(candidateSyncKey) && !isManual && !requestedSyncPush
    : false;
  const syncSlot = alreadyCompleted || suspended ? null : candidateSyncSlot;
  const oscarSlot = OSCAR_BRIEF_CRONS.includes(scheduledCron)
    ? resolveParisSlot(scheduledCron, {hour: 11, minute: 30, observedAt})
    : null;
  const digest = scheduledCron === ESUPPORT_DIGEST_CRON;
  const daily = Boolean(syncSlot);
  const oscarWindow = Boolean(oscarSlot);
  const syncRequested = isManual || daily || requestedSyncPush;
  const latestDueSlot = latestSportEasySyncSlot(observedAt);
  const latestDueKey = syncSlotKey(latestDueSlot);
  const proofSlot = syncSlot ?? (
    (isManual || requestedSyncPush) && latestDueKey && !completed.has(latestDueKey)
      ? latestDueSlot
      : null
  );
  const active = isManual || isPush || daily || digest;
  const mode = digest ? "digest" : requestedSyncPush || isManual ? "manual" : isPush ? "release" : "daily";
  const sync = syncRequested && individualPublicationAuthorized;

  return {
    active,
    oscar: isManual || oscarWindow,
    sync,
    syncRequested,
    mode,
    slot: candidateSyncKey
      ? candidateSyncKey
      : oscarSlot
        ? `oscar-brief:${oscarSlot.parisDate}`
        : digest
          ? "esupport-digest"
          : isManual
            ? "manual"
            : isPush
              ? "release"
              : "none",
    nominalAt: candidateSyncSlot?.nominalAt || oscarSlot?.nominalAt || null,
    catchUp: Boolean(syncSlot && recoverySyncSlot),
    alreadyCompleted,
    suspended,
    proofSlot: sync ? syncSlotKey(proofSlot) : null,
  };
}
