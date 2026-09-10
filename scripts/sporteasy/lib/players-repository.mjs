export class PlayerRepositoryValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PlayerRepositoryValidationError";
    this.kind = "validation";
    this.details = details;
  }
}

function canonicalId(value, label) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) {
    throw new PlayerRepositoryValidationError(`${label} sans identifiant SportEasy valide.`);
  }
  return text;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function dateOnly(value, label) {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  ) {
    throw new PlayerRepositoryValidationError(`${label} contient une date invalide.`);
  }
  return text;
}

function displayName(profile) {
  const directName = cleanText(profile?.name ?? profile?.display_name ?? profile?.displayName);
  if (directName) return directName;

  const combinedName = [cleanText(profile?.first_name), cleanText(profile?.last_name)]
    .filter(Boolean)
    .join(" ");
  if (combinedName) return combinedName;

  throw new PlayerRepositoryValidationError(
    `Le profil SportEasy ${String(profile?.id ?? "inconnu")} n'a pas de nom exploitable.`,
  );
}

function normalizedRole(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr");
}

function roleLabels(profile) {
  const candidates = [];
  const append = (value) => {
    if (typeof value === "string") candidates.push(value);
    else if (value && typeof value === "object") {
      for (const key of ["slug_name", "slug", "name", "label"]) {
        if (typeof value[key] === "string") candidates.push(value[key]);
      }
    }
  };

  append(profile?.role);
  if (Array.isArray(profile?.roles)) profile.roles.forEach(append);
  return candidates.map(normalizedRole).filter(Boolean);
}

function profileIsPlayer(profile) {
  if (profile?.is_player === true) return true;
  if (profile?.is_player === false) return false;

  const numericRole = Number(profile?.role?.id ?? profile?.role);
  if (Number.isInteger(numericRole)) {
    if ([2, 3, 4].includes(numericRole)) return true;
    if ([1, 5].includes(numericRole)) return false;
    throw new PlayerRepositoryValidationError(
      `Le rôle numérique ${numericRole} du profil ${String(profile?.id ?? "inconnu")} est inconnu.`,
    );
  }

  const labels = roleLabels(profile);
  if (labels.some((label) => label.includes("player") || label.includes("joueur"))) return true;
  if (labels.length > 0) return false;

  throw new PlayerRepositoryValidationError(
    `Le rôle du profil SportEasy ${String(profile?.id ?? "inconnu")} est absent ou ambigu.`,
  );
}

function profileIsArchived(profile) {
  return Boolean(
    profile?.archived_at ||
      profile?.archivedAt ||
      profile?.archived === true ||
      profile?.is_archived === true,
  );
}

function normalizeProfiles(
  rawProfiles,
  sourceLabel,
  { allowEmpty = false, expectedArchived = null } = {},
) {
  if (!Array.isArray(rawProfiles) || (!allowEmpty && rawProfiles.length === 0)) {
    throw new PlayerRepositoryValidationError(`La réponse ${sourceLabel} est vide ou invalide.`);
  }

  const seen = new Set();
  const players = [];
  for (const profile of rawProfiles) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      throw new PlayerRepositoryValidationError(`La réponse ${sourceLabel} contient un profil invalide.`);
    }
    const sporteasyId = canonicalId(profile.id, "Profil");
    if (seen.has(sporteasyId)) {
      throw new PlayerRepositoryValidationError(
        `Le profil SportEasy ${sporteasyId} est présent plusieurs fois dans ${sourceLabel}.`,
        { duplicateId: sporteasyId, sourceLabel },
      );
    }
    seen.add(sporteasyId);

    if (expectedArchived === true && !profileIsArchived(profile)) {
      throw new PlayerRepositoryValidationError(
        `Le profil ${sporteasyId} reçu comme ancien n'est pas marqué archivé par SportEasy.`,
      );
    }
    if (expectedArchived === false && profileIsArchived(profile)) {
      throw new PlayerRepositoryValidationError(
        `Le profil ${sporteasyId} reçu dans l'effectif actuel est marqué archivé.`,
      );
    }

    if (profileIsPlayer(profile)) {
      players.push({ sporteasyId, displayName: displayName(profile) });
    }
  }

  if (!allowEmpty && players.length === 0) {
    throw new PlayerRepositoryValidationError(`${sourceLabel} ne contient aucun joueur identifiable.`);
  }
  return players;
}

function normalizeSeason(rawSeason) {
  if (!rawSeason || typeof rawSeason !== "object" || Array.isArray(rawSeason)) {
    throw new PlayerRepositoryValidationError("Une saison SportEasy est invalide.");
  }

  const sporteasyId = canonicalId(rawSeason.id, "Saison");
  const name = cleanText(rawSeason.name);
  if (!name) {
    throw new PlayerRepositoryValidationError(`La saison SportEasy ${sporteasyId} n'a pas de nom.`);
  }
  if (typeof rawSeason.current !== "boolean") {
    throw new PlayerRepositoryValidationError(
      `La saison SportEasy ${sporteasyId} n'indique pas clairement si elle est actuelle.`,
    );
  }

  const startDate = dateOnly(rawSeason.start_date, `La saison ${name}`);
  const endDate = dateOnly(rawSeason.end_date, `La saison ${name}`);
  if (startDate && endDate && startDate > endDate) {
    throw new PlayerRepositoryValidationError(`Les dates de la saison ${name} sont inversées.`);
  }

  return {
    sporteasyId,
    name,
    startDate,
    endDate,
    isCurrent: rawSeason.current,
  };
}

function normalizeSeasons(rawSeasons) {
  if (!Array.isArray(rawSeasons) || rawSeasons.length === 0) {
    throw new PlayerRepositoryValidationError("La liste des saisons SportEasy est vide ou invalide.");
  }

  const seasons = rawSeasons.map(normalizeSeason);
  const uniqueIds = new Set(seasons.map((season) => season.sporteasyId));
  if (uniqueIds.size !== seasons.length) {
    throw new PlayerRepositoryValidationError("La liste SportEasy contient une saison en double.");
  }

  const currentSeasons = seasons.filter((season) => season.isCurrent);
  if (currentSeasons.length !== 1) {
    throw new PlayerRepositoryValidationError(
      `SportEasy doit fournir exactement une saison actuelle, ${currentSeasons.length} reçue(s).`,
    );
  }

  return seasons.sort((left, right) => {
    const dateOrder = (left.startDate ?? "").localeCompare(right.startDate ?? "");
    return dateOrder || left.sporteasyId.localeCompare(right.sporteasyId, "fr", { numeric: true });
  });
}

function makeSeasonMap(seasons, profilesBySeason) {
  if (profilesBySeason === null || profilesBySeason === undefined) return null;
  if (!(profilesBySeason instanceof Map)) {
    throw new PlayerRepositoryValidationError("Les effectifs par saison sont absents.");
  }

  const result = new Map();
  for (const season of seasons) {
    if (!profilesBySeason.has(season.sporteasyId)) {
      throw new PlayerRepositoryValidationError(
        `L'effectif de la saison ${season.name} n'a pas été récupéré.`,
        { seasonId: season.sporteasyId },
      );
    }
    result.set(
      season.sporteasyId,
      normalizeProfiles(profilesBySeason.get(season.sporteasyId), `saison ${season.name}`),
    );
  }
  return result;
}

function pickLatestName(player, seasonsById) {
  const observations = [...player.observations].sort((left, right) => {
    const leftSeason = seasonsById.get(left.seasonId);
    const rightSeason = seasonsById.get(right.seasonId);
    return (rightSeason?.startDate ?? "").localeCompare(leftSeason?.startDate ?? "");
  });
  return observations[0]?.displayName ?? player.currentDisplayName;
}

export function buildPlayerRepository({
  rawSeasons,
  rawCurrentProfiles,
  rawArchivedProfiles = [],
  rawProfilesBySeason = null,
  previousRepository = null,
  syncedAt = new Date().toISOString(),
}) {
  const seasons = normalizeSeasons(rawSeasons);
  const currentSeason = seasons.find((season) => season.isCurrent);
  const profilesBySeason = makeSeasonMap(seasons, rawProfilesBySeason);
  const currentProfiles = normalizeProfiles(rawCurrentProfiles, "effectif actuel", {
    expectedArchived: false,
  });
  const archivedProfiles = normalizeProfiles(rawArchivedProfiles, "anciens joueurs", {
    allowEmpty: true,
    expectedArchived: true,
  });
  const currentIds = new Set(currentProfiles.map((profile) => profile.sporteasyId));
  const seasonsById = new Map(seasons.map((season) => [season.sporteasyId, season]));
  const playersById = new Map();

  const previousPlayers = (() => {
    if (previousRepository === null || previousRepository === undefined) return [];
    if (
      previousRepository?.metadata?.validationStatus !== "valid" ||
      !Array.isArray(previousRepository?.players)
    ) {
      throw new PlayerRepositoryValidationError(
        "Le précédent référentiel joueurs n'est pas une version validée exploitable.",
      );
    }

    const seen = new Set();
    return previousRepository.players.map((player) => {
      const sporteasyId = canonicalId(player?.sporteasyId, "Ancien référentiel");
      if (seen.has(sporteasyId)) {
        throw new PlayerRepositoryValidationError(
          `Le précédent référentiel contient deux fois le joueur ${sporteasyId}.`,
        );
      }
      seen.add(sporteasyId);
      const previousDisplayName = cleanText(player?.displayName);
      if (!previousDisplayName) {
        throw new PlayerRepositoryValidationError(
          `Le joueur ${sporteasyId} du précédent référentiel n'a pas de nom.`,
        );
      }
      const seasonIds = Array.isArray(player?.seasonIds)
        ? [...new Set(player.seasonIds.map((seasonId) => canonicalId(seasonId, "Saison précédente")))]
        : [];
      for (const seasonId of seasonIds) {
        if (!seasonsById.has(seasonId)) {
          throw new PlayerRepositoryValidationError(
            `Le joueur ${sporteasyId} référence une saison ${seasonId} inconnue de SportEasy.`,
          );
        }
      }
      return {
        sporteasyId,
        displayName: previousDisplayName,
        seasonIds,
        seasonMembershipStatus: cleanText(player?.seasonMembershipStatus) || null,
      };
    });
  })();

  const createPlayer = (profile) => ({
    sporteasyId: profile.sporteasyId,
    currentDisplayName: null,
    archivedDisplayName: null,
    previousDisplayName: null,
    previousSeasonMembershipStatus: null,
    observations: [],
    seasonIds: new Set(),
  });

  for (const previousPlayer of previousPlayers) {
    const player = createPlayer(previousPlayer);
    player.previousDisplayName = previousPlayer.displayName;
    player.previousSeasonMembershipStatus = previousPlayer.seasonMembershipStatus;
    previousPlayer.seasonIds.forEach((seasonId) => player.seasonIds.add(seasonId));
    playersById.set(previousPlayer.sporteasyId, player);
  }

  for (const profile of archivedProfiles) {
    if (currentIds.has(profile.sporteasyId)) {
      throw new PlayerRepositoryValidationError(
        `Le profil ${profile.sporteasyId} est à la fois actuel et archivé.`,
      );
    }
    const player = playersById.get(profile.sporteasyId) ?? createPlayer(profile);
    player.archivedDisplayName = profile.displayName;
    playersById.set(profile.sporteasyId, player);
  }

  for (const profile of currentProfiles) {
    const existing = playersById.get(profile.sporteasyId) ?? createPlayer(profile);
    existing.currentDisplayName = profile.displayName;
    if (!profilesBySeason) existing.seasonIds.add(currentSeason.sporteasyId);
    playersById.set(profile.sporteasyId, existing);
  }

  if (profilesBySeason) {
    for (const season of seasons) {
      for (const profile of profilesBySeason.get(season.sporteasyId)) {
        const existing = playersById.get(profile.sporteasyId) ?? createPlayer(profile);
        existing.observations.push({ seasonId: season.sporteasyId, displayName: profile.displayName });
        existing.seasonIds.add(season.sporteasyId);
        playersById.set(profile.sporteasyId, existing);
      }
    }

    for (const profile of currentProfiles) {
      const existing = playersById.get(profile.sporteasyId);
      if (!existing?.seasonIds.has(currentSeason.sporteasyId)) {
        throw new PlayerRepositoryValidationError(
          `Le joueur actuel ${profile.sporteasyId} n'apparaît pas dans l'effectif de la saison actuelle.`,
          { playerId: profile.sporteasyId, currentSeasonId: currentSeason.sporteasyId },
        );
      }
    }
  }

  const players = [...playersById.values()].map((player) => {
    const seasonIds = seasons
      .filter((season) => player.seasonIds.has(season.sporteasyId))
      .map((season) => season.sporteasyId);
    const isCurrent = currentIds.has(player.sporteasyId);
    const displayNameValue = isCurrent
      ? player.currentDisplayName
      : pickLatestName(player, seasonsById) ??
        player.archivedDisplayName ??
        player.previousDisplayName;

    if (seasonIds.length > 0) {
      const firstIndex = seasons.findIndex((season) => season.sporteasyId === seasonIds[0]);
      const lastIndex = seasons.findIndex((season) => season.sporteasyId === seasonIds.at(-1));
      if (firstIndex < 0 || lastIndex < firstIndex) {
        throw new PlayerRepositoryValidationError(
          `Les bornes de saisons du joueur ${player.sporteasyId} sont incohérentes.`,
        );
      }
    }

    return {
      sporteasyId: player.sporteasyId,
      displayName: displayNameValue,
      isCurrent,
      seasonIds,
      firstSeenSeasonId: seasonIds[0] ?? null,
      lastSeenSeasonId: seasonIds.at(-1) ?? null,
      seasonMembershipStatus:
        profilesBySeason || isCurrent
          ? "confirmed"
          : player.previousSeasonMembershipStatus ?? "unknown",
    };
  });

  const finalIds = new Set(players.map((player) => player.sporteasyId));
  if (finalIds.size !== players.length) {
    throw new PlayerRepositoryValidationError("Le référentiel final contient un identifiant en double.");
  }

  const currentPlayerCount = players.filter((player) => player.isCurrent).length;
  if (currentPlayerCount !== currentProfiles.length) {
    throw new PlayerRepositoryValidationError(
      `Effectif actuel incohérent : ${currentProfiles.length} reçu(s), ${currentPlayerCount} construit(s).`,
    );
  }

  players.sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "fr", { sensitivity: "base" }),
  );

  const previousCurrentIds = new Set(
    previousRepository?.players
      ?.filter((player) => player?.isCurrent === true)
      .map((player) => String(player.sporteasyId)) ?? [],
  );
  const addedCurrentIds = [...currentIds].filter((id) => !previousCurrentIds.has(id)).sort();
  const removedCurrentIds = [...previousCurrentIds].filter((id) => !currentIds.has(id)).sort();
  const previousRosterChangeHistory = Array.isArray(
    previousRepository?.metadata?.currentRosterChangeHistory,
  )
    ? previousRepository.metadata.currentRosterChangeHistory
    : [];
  const currentRosterChangeHistory = [...previousRosterChangeHistory];
  if (previousRepository && (addedCurrentIds.length > 0 || removedCurrentIds.length > 0)) {
    currentRosterChangeHistory.push({
      syncedAt,
      previousCurrentPlayerCount: previousCurrentIds.size,
      currentPlayerCount,
      addedCurrentIds,
      removedCurrentIds,
    });
  }

  return {
    players,
    seasons,
    metadata: {
      source: "SportEasy",
      syncedAt,
      validationStatus: "valid",
      totalPlayerCount: players.length,
      historicalPlayerCount: players.length,
      currentPlayerCount,
      previousCurrentPlayerCount: previousCurrentIds.size,
      formerPlayerCount: players.length - currentPlayerCount,
      addedCurrentIds,
      removedCurrentIds,
      statusToCurrentIds: addedCurrentIds,
      statusToFormerIds: removedCurrentIds,
      currentRosterChangeHistory,
      historicalPlayersAddedFromStatistics: [
        ...new Set(previousRepository?.metadata?.historicalPlayersAddedFromStatistics ?? []),
      ].sort(),
      seasonsAvailable: seasons.map((season) => season.sporteasyId),
      seasonsQueried: profilesBySeason ? seasons.map((season) => season.sporteasyId) : [],
      seasonMembershipStatus: profilesBySeason ? "complete" : "partial",
      errors: [],
      warnings: profilesBySeason
        ? []
        : [
            "SportEasy fournit les anciens profils archivés, mais pas leur appartenance précise à chaque saison.",
          ],
    },
  };
}
