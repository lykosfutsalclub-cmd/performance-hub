import { SCORING_CONFIG } from "./scoring-config.mjs";

export function safeDivide(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
    ? numerator / denominator
    : null;
}

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function clampRating(value) {
  if (!Number.isFinite(value)) return null;
  return Math.min(
    SCORING_CONFIG.RATING_MAX,
    Math.max(SCORING_CONFIG.RATING_MIN, Math.round(value)),
  );
}

export function ratingFromPercentile(percentile) {
  if (!Number.isFinite(percentile)) return null;
  const bounded = Math.min(1, Math.max(0, percentile));
  return clampRating(SCORING_CONFIG.RATING_MIN + 98 * bounded);
}

export function sampleConfidence(matchesPlayed) {
  if (!Number.isFinite(matchesPlayed) || matchesPlayed < 0) return null;
  return Math.min(1, matchesPlayed / SCORING_CONFIG.CURRENT_CONFIDENCE_MATCHES);
}

export function adjustRatingForSample(rating, confidence) {
  if (!Number.isFinite(rating) || !Number.isFinite(confidence)) return null;
  return clampRating(
    SCORING_CONFIG.RATING_MEDIAN
      + confidence * (rating - SCORING_CONFIG.RATING_MEDIAN),
  );
}

export function normalizePosition(position) {
  const normalized = String(position ?? "").trim().toLocaleUpperCase("fr");
  const mentions = [...normalized.matchAll(/GARDIEN|GOAL|DÉFENSEUR|DEFENSEUR|DÉF|DEF|MILIEU|ATTAQUANT|ATT|PIVOT|JOUEUR|(^|[\s/,+-])G(?=$|[\s/,+-])|(^|[\s/,+-])D(?=$|[\s/,+-])|(^|[\s/,+-])M(?=$|[\s/,+-])|(^|[\s/,+-])A(?=$|[\s/,+-])/g)]
    .map((match) => match[0].replace(/^[\s/,+-]+/, "").trim())
    .filter(Boolean);
  const latest = mentions.at(-1) ?? normalized;
  if (latest === "G" || latest.includes("GARDIEN") || latest.includes("GOAL")) return "G";
  if (latest === "D" || latest === "DEF" || latest.includes("DÉF") || latest.includes("DEFENSEUR")) return "D";
  if (latest === "M" || latest.includes("MILIEU") || latest.includes("JOUEUR")) return "M";
  if (["A", "ATT", "PIVOT"].includes(latest) || latest.includes("ATTAQUANT")) return "A";
  return "M";
}
