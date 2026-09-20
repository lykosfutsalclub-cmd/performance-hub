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

export function determineScheduleMission({
  eventName,
  commitMessage = "",
  scheduledCron = "",
  observedAt = new Date(),
  individualPublicationAuthorized = false,
} = {}) {
  const isManual = eventName === "workflow_dispatch";
  const isPush = eventName === "push";
  const requestedSyncPush = isPush && /\[esupport-sync\]/i.test(commitMessage);

  const syncSlot = SPORTEASY_SYNC_CRONS.includes(scheduledCron)
    ? resolveParisSlot(scheduledCron, {hour: 10, observedAt})
    : null;
  const oscarSlot = OSCAR_BRIEF_CRONS.includes(scheduledCron)
    ? resolveParisSlot(scheduledCron, {hour: 11, minute: 30, observedAt})
    : null;
  const digest = scheduledCron === ESUPPORT_DIGEST_CRON;
  const daily = Boolean(syncSlot);
  const oscarWindow = Boolean(oscarSlot);
  const syncRequested = isManual || daily || requestedSyncPush;
  const active = isManual || isPush || daily || digest;
  const mode = digest ? "digest" : requestedSyncPush || isManual ? "manual" : isPush ? "release" : "daily";

  return {
    active,
    oscar: isManual || oscarWindow,
    sync: syncRequested && individualPublicationAuthorized,
    syncRequested,
    mode,
    slot: syncSlot
      ? `sporteasy-sync:${syncSlot.parisDate}`
      : oscarSlot
        ? `oscar-brief:${oscarSlot.parisDate}`
        : digest
          ? "esupport-digest"
          : isManual
            ? "manual"
            : isPush
              ? "release"
              : "none",
    nominalAt: syncSlot?.nominalAt || oscarSlot?.nominalAt || null,
  };
}
