import { SCORING_CONFIG } from "../../../src/performance/scoring-config.mjs";

function time(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function publicationQualityErrors({
  matchAudit,
  secondaryAudit = null,
  secondaryRepository = null,
  primaryRepositories = [],
}) {
  const errors = [];
  if (matchAudit?.status !== "passed") {
    errors.push("L’audit des matchs n’est pas réussi.");
  }

  if (secondaryAudit !== null || secondaryRepository !== null) {
    if (secondaryAudit?.metadata?.status !== "valid") {
      errors.push("L’audit des statistiques secondaires n’est pas valide.");
    }
    if (secondaryRepository?.metadata?.validationStatus !== "valid") {
      errors.push("Le référentiel des statistiques secondaires n’est pas valide.");
    }
    if (secondaryRepository?.metadata?.formulaVersion !== SCORING_CONFIG.VERSION) {
      errors.push(`Les statistiques secondaires ne portent pas la version ${SCORING_CONFIG.VERSION}.`);
    }

    const generatedAt = time(secondaryRepository?.metadata?.generatedAt);
    const newestPrimary = Math.max(...primaryRepositories.map((repository) => time(repository?.metadata?.syncedAt) ?? -Infinity));
    if (generatedAt === null || (Number.isFinite(newestPrimary) && generatedAt < newestPrimary)) {
      errors.push("Les statistiques secondaires sont plus anciennes que leurs données sources.");
    }

    const auditedAt = time(secondaryAudit?.metadata?.generatedAt);
    if (generatedAt !== null && (auditedAt === null || auditedAt < generatedAt)) {
      errors.push("L’audit des statistiques secondaires est plus ancien que les données à publier.");
    }
  }

  return errors;
}

export function assertPublicationQuality(input) {
  const errors = publicationQualityErrors(input);
  if (errors.length) {
    throw new Error(`Publication refusée par la barrière de qualité :\n- ${errors.join("\n- ")}`);
  }
}
