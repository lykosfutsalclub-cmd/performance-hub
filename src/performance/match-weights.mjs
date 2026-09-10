import { SCORING_CONFIG } from "./scoring-config.mjs";

function normalizedLabel(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function classifyScoringMatch(match) {
  if (!match?.eventId) return null;

  const name = normalizedLabel(match.name);
  const categoryName = normalizedLabel(match.category?.name);
  const categoryType = normalizedLabel(match.category?.type);
  const categorySlug = normalizedLabel(match.category?.slug);
  const searchable = `${name} ${categoryName} ${categorySlug}`;

  if (/\bpro[\s-]?tour\b/.test(searchable) || searchable.includes("championnat de france")) {
    return "PROTOUR";
  }
  if (
    name.includes("tournoi")
    || categoryType === "championship_match"
    || categoryType === "cup_match"
    || categoryType === "tournament"
  ) {
    return "COMPETITION";
  }
  if (categoryType === "friendly_match" || categorySlug === "friendly" || categoryName === "match amical") {
    return "TEST_MATCH";
  }
  return null;
}

export function scoringMatchWeight(match) {
  const type = classifyScoringMatch(match);
  return type ? SCORING_CONFIG.MATCH_WEIGHTS[type] ?? null : null;
}

export function scoringMatchAudit(matches) {
  return (matches ?? [])
    .filter((match) => scoringMatchWeight(match) === null)
    .map((match) => ({
      severity: "error",
      code: "invalid-scoring-match",
      eventId: match?.eventId ? String(match.eventId) : null,
      name: match?.name ?? null,
      category: match?.category?.name ?? null,
    }));
}
