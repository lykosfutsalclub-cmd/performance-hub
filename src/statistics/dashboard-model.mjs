const PERIOD_KEYS = new Set(["current", "previous", "allTime"]);

function requirePeriod(repository, periodKey) {
  if (!PERIOD_KEYS.has(periodKey)) throw new Error(`Période inconnue : ${periodKey}.`);
  const period = repository?.periods?.[periodKey];
  if (!period) throw new Error(`Période indisponible : ${periodKey}.`);
  return period;
}

function availableMetric(metric) {
  if (!metric || metric.status !== "available" || metric.value === null) return null;
  return {
    value: metric.value,
    unit: metric.unit ?? null,
    sourceType: metric.sourceType,
  };
}

function availableMetrics(metrics = {}) {
  return Object.fromEntries(
    Object.entries(metrics)
      .map(([key, metric]) => [key, availableMetric(metric)])
      .filter(([, metric]) => metric !== null),
  );
}

export function buildTeamDashboard(repository, periodKey) {
  const period = requirePeriod(repository, periodKey);
  const metrics = availableMetrics(period.team?.metrics);
  return {
    period: periodKey,
    seasonIds: [...period.seasonIds],
    available: Object.keys(metrics).length > 0,
    metrics,
    rankings: period.rankings ?? [],
  };
}

export function buildPlayerDashboard(repository, playersRepository, sporteasyId, periodKey) {
  const period = requirePeriod(repository, periodKey);
  const id = String(sporteasyId);
  const player = playersRepository?.players?.find((candidate) => String(candidate.sporteasyId) === id);
  if (!player) throw new Error(`Joueur SportEasy inconnu : ${id}.`);
  const statistics = period.players?.[id] ?? null;
  const metrics = availableMetrics(statistics?.metrics);
  const customMetrics = (statistics?.customMetrics ?? []).filter(
    (metric) => availableMetric(metric) !== null,
  );
  return {
    player: {
      sporteasyId: id,
      displayName: player.displayName,
      isCurrent: player.isCurrent,
    },
    period: periodKey,
    available: Object.keys(metrics).length > 0 || customMetrics.length > 0,
    metrics,
    customMetrics,
  };
}

function leaderboard(playersRepository, periodPlayers, metricKey) {
  return playersRepository.players
    .map((player) => ({
      sporteasyId: String(player.sporteasyId),
      displayName: player.displayName,
      isCurrent: player.isCurrent,
      value: availableMetric(periodPlayers?.[String(player.sporteasyId)]?.metrics?.[metricKey])?.value ?? null,
    }))
    .filter((entry) => entry.value !== null)
    .sort((left, right) => right.value - left.value || left.displayName.localeCompare(right.displayName, "fr"));
}

export function buildPantheonDashboard(repository, playersRepository) {
  const periodPlayers = requirePeriod(repository, "allTime").players;
  return {
    period: "allTime",
    records: {
      goals: leaderboard(playersRepository, periodPlayers, "goals"),
      assists: leaderboard(playersRepository, periodPlayers, "assists"),
      matchesPlayed: leaderboard(playersRepository, periodPlayers, "matchesPlayed"),
      manOfMatch: leaderboard(playersRepository, periodPlayers, "manOfMatch"),
    },
  };
}
