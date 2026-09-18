const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function publicSlug(value, fallback = "element") {
  const slug = String(value ?? "")
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || fallback;
}

export function publicPlayerId(displayName) {
  return `joueur-${publicSlug(displayName, "sans-nom")}`;
}

export function publicSeasonId(label) {
  return `saison-${publicSlug(label, "sans-date")}`;
}

export function publicMatchId({ date, opponent }) {
  return `match-${publicSlug(date, "sans-date")}-${publicSlug(opponent, "adversaire")}`;
}

export function buildPublicPlayerIdMap(players) {
  const bySourceId = new Map();
  const owners = new Map();
  for (const player of players ?? []) {
    const sourceId = String(player?.sporteasyId ?? "").trim();
    const displayName = String(player?.displayName ?? "").trim();
    if (!sourceId || !displayName) continue;
    const publicId = publicPlayerId(displayName);
    const owner = owners.get(publicId);
    if (owner && owner !== sourceId) {
      throw new Error(`Identifiant public en conflit pour ${displayName}.`);
    }
    owners.set(publicId, sourceId);
    bySourceId.set(sourceId, publicId);
  }
  return bySourceId;
}
