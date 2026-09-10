const MATCH_TYPES = new Set([
  "championship_match",
  "cup_match",
  "friendly_match",
]);

function normalizedText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

export function isInternalTrainingEvent(event) {
  const type = event?.category?.type;
  const categoryName = normalizedText(event?.category?.localized_name);
  const name = normalizedText(event?.name);
  return (
    type === "challenge_match" ||
    categoryName === "match entre nous" ||
    name.includes("match entre nous")
  );
}

export function isStatisticalMatchEvent(event) {
  return MATCH_TYPES.has(event?.category?.type) && !isInternalTrainingEvent(event);
}

function isTournamentSummaryMatch(event) {
  if (!MATCH_TYPES.has(event?.category?.type)) return false;
  const name = normalizedText(event?.name);
  return name.includes("tournoi") || name.includes("pro tour");
}

function asId(value) {
  const text = String(value ?? "").trim();
  return /^[1-9]\d*$/.test(text) ? text : null;
}

function asScore(value) {
  if (Number.isInteger(value) && value >= 0) return value;
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

function toIsoDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;
}

function playerName(playersById, profileId) {
  return playersById.get(profileId)?.displayName ?? `Joueur SportEasy ${profileId}`;
}

function flattenPlayerMetrics(player) {
  const metrics = {};
  const records = [];
  for (const category of player?.stats ?? []) {
    for (const stat of category?.stats ?? []) {
      if (!stat?.slug_name) continue;
      metrics[stat.slug_name] = stat.value ?? null;
      records.push({
        category: category.slug_name ?? null,
        slug: stat.slug_name,
        label: stat.localized_name ?? null,
        shortLabel: stat.localized_name_short ?? null,
        value: stat.value ?? null,
      });
    }
  }
  return { metrics, records };
}

function flattenTeamMetrics(payload, teamSide) {
  const metrics = {};
  const records = [];
  for (const category of payload?.opponents ?? []) {
    for (const stat of category?.stats ?? []) {
      if (!stat?.slug_name) continue;
      const teamValue = teamSide === "left" ? stat.value_left : stat.value_right;
      const opponentValue = teamSide === "left" ? stat.value_right : stat.value_left;
      metrics[stat.slug_name] = { team: teamValue ?? null, opponent: opponentValue ?? null };
      records.push({
        category: category.slug_name ?? null,
        slug: stat.slug_name,
        label: stat.localized_name ?? null,
        shortLabel: stat.localized_name_short ?? null,
        team: teamValue ?? null,
        opponent: opponentValue ?? null,
      });
    }
  }
  return { metrics, records };
}

function attendanceFromUi(uiCapture, playersById) {
  const entries = [];
  for (const field of uiCapture?.routes?.presence?.formValues ?? []) {
    const match = /^presence_group_(\d+)$/.exec(field?.name ?? "");
    if (!match || field.type !== "radio" || field.checked !== true) continue;
    const profileId = match[1];
    entries.push({
      profileId,
      playerName: playerName(playersById, profileId),
      status: field.value || "unknown",
    });
  }
  entries.sort((left, right) => left.playerName.localeCompare(right.playerName, "fr"));
  const summary = {};
  for (const entry of entries) summary[entry.status] = (summary[entry.status] ?? 0) + 1;
  return { entries, summary };
}

function reportFromUi(uiCapture) {
  const report = (uiCapture?.routes?.report?.formValues ?? []).find(
    (field) => field?.tag === "TEXTAREA",
  );
  const value = typeof report?.value === "string" ? report.value.trim() : "";
  return value || null;
}

function eventRatingFromDetails(eventDetails) {
  const rating = eventDetails?.stats?.event_rating;
  if (rating === null || rating === undefined) return null;
  const average = Number(rating.average);
  const voteCount = Number(rating.nb_votes);
  if (
    !Number.isFinite(average) ||
    average < 1 ||
    average > 6 ||
    !Number.isInteger(voteCount) ||
    voteCount < 1
  ) {
    throw new Error("La note SportEasy d'un match est invalide.");
  }
  return {
    average,
    voteCount,
    scaleMax: 6,
    sourceField: "stats.event_rating.average",
  };
}

function determineOutcome(team, opponent, teamScore, opponentScore) {
  if (team?.match_outcome === "victory") return "victory";
  if (team?.match_outcome === "tie") return "tie";
  if (team?.match_outcome === "defeat") return "defeat";
  if (teamScore === null || opponentScore === null) return null;
  if (teamScore > opponentScore) return "victory";
  if (teamScore < opponentScore) return "defeat";
  return "tie";
}

function normalizeMatch({ event, statsPayload, eventDetails, uiCapture, playersById }) {
  const left = event.opponent_left ?? statsPayload?.opponent_left ?? null;
  const right = event.opponent_right ?? statsPayload?.opponent_right ?? null;
  const teamSide = left?.is_current_team ? "left" : right?.is_current_team ? "right" : null;
  const team = teamSide === "left" ? left : teamSide === "right" ? right : null;
  const opponent = teamSide === "left" ? right : teamSide === "right" ? left : null;
  const scoreMetric = flattenTeamMetrics(statsPayload, teamSide).metrics.score;
  const teamScore = asScore(team?.score) ?? asScore(scoreMetric?.team);
  const opponentScore = asScore(opponent?.score) ?? asScore(scoreMetric?.opponent);
  const teamMetrics = flattenTeamMetrics(statsPayload, teamSide);
  const attendance = attendanceFromUi(uiCapture, playersById);
  const playerStatistics = (statsPayload?.players ?? []).map((player) => {
    const profileId = asId(player?.id);
    const flattened = flattenPlayerMetrics(player);
    return {
      profileId,
      playerName: profileId ? playerName(playersById, profileId) : null,
      metrics: flattened.metrics,
      metricRecords: flattened.records,
    };
  });
  playerStatistics.sort((a, b) => (a.playerName ?? "").localeCompare(b.playerName ?? "", "fr"));

  return {
    eventId: asId(event.id),
    seasonId: asId(event.season?.id),
    name: event.name ?? null,
    startAt: event.start_at ?? null,
    endAt: event.end_at ?? null,
    day: toIsoDay(event.start_at),
    category: {
      id: asId(event.category?.id),
      type: event.category?.type ?? null,
      slug: event.category?.slug_name ?? null,
      name: event.category?.localized_name ?? null,
      championshipDay: event.category?.championship_day ?? null,
    },
    status: {
      isPast: event.is_past === true,
      isCancelled: event.is_cancelled === true,
      hasCompleteScore: teamScore !== null && opponentScore !== null,
    },
    team: team
      ? { id: asId(team.id), name: team.full_name ?? team.short_name ?? null, score: teamScore }
      : null,
    opponent: opponent
      ? {
          id: asId(opponent.id),
          name: opponent.full_name ?? opponent.short_name ?? null,
          shortName: opponent.short_name ?? null,
          score: opponentScore,
        }
      : null,
    venue: event.location
      ? {
          id: asId(event.location.id),
          name: event.location.name ?? null,
          address: event.location.formatted_address ?? null,
          latitude: event.location.lat ?? null,
          longitude: event.location.lng ?? null,
        }
      : null,
    homeAway:
      team?.is_home === true ? "home" : team?.is_home === false ? "away" : "neutral_or_unknown",
    outcome: determineOutcome(team, opponent, teamScore, opponentScore),
    score: { team: teamScore, opponent: opponentScore },
    teamMetrics: teamMetrics.metrics,
    teamMetricRecords: teamMetrics.records,
    playerStatistics,
    attendance,
    report: reportFromUi(uiCapture),
    eventRating: eventRatingFromDetails(eventDetails),
    capture: {
      statistics: Boolean(statsPayload),
      eventDetails: Boolean(eventDetails),
      summary: Boolean(uiCapture?.routes?.summary),
      presence: Boolean(uiCapture?.routes?.presence),
      report: Boolean(uiCapture?.routes?.report),
      uiErrors: uiCapture?.errors ?? [],
    },
  };
}

function emptyAggregate(key, name = null) {
  return {
    key,
    name,
    matches: 0,
    completed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    firstMatchAt: null,
    lastMatchAt: null,
  };
}

function addMatch(aggregate, match) {
  aggregate.matches += 1;
  if (!aggregate.firstMatchAt || match.startAt < aggregate.firstMatchAt) {
    aggregate.firstMatchAt = match.startAt;
  }
  if (!aggregate.lastMatchAt || match.startAt > aggregate.lastMatchAt) {
    aggregate.lastMatchAt = match.startAt;
  }
  if (!match.status.hasCompleteScore || match.status.isCancelled) return;
  aggregate.completed += 1;
  aggregate.goalsFor += match.score.team;
  aggregate.goalsAgainst += match.score.opponent;
  if (match.outcome === "victory") aggregate.wins += 1;
  else if (match.outcome === "tie") aggregate.draws += 1;
  else if (match.outcome === "defeat") aggregate.losses += 1;
}

function aggregateBy(matches, keyOf, nameOf = () => null) {
  const index = new Map();
  for (const match of matches) {
    const key = keyOf(match);
    if (!key) continue;
    if (!index.has(key)) index.set(key, emptyAggregate(key, nameOf(match)));
    addMatch(index.get(key), match);
  }
  return [...index.values()].sort((left, right) =>
    right.matches - left.matches || String(left.name).localeCompare(String(right.name), "fr"),
  );
}

function playerAggregates(matches, playersById) {
  const index = new Map();
  for (const match of matches) {
    for (const player of match.playerStatistics) {
      if (!player.profileId) continue;
      if (!index.has(player.profileId)) {
        index.set(player.profileId, {
          profileId: player.profileId,
          playerName: playerName(playersById, player.profileId),
          matchesWithStatistics: 0,
          goals: 0,
          assists: 0,
          manOfMatch: 0,
          yellowCards: 0,
          redCards: 0,
          ratings: [],
        });
      }
      const aggregate = index.get(player.profileId);
      aggregate.matchesWithStatistics += 1;
      aggregate.goals += Number(player.metrics.player_goals) || 0;
      aggregate.assists += Number(player.metrics.player_assists) || 0;
      aggregate.manOfMatch += player.metrics.man_of_event === true ? 1 : 0;
      aggregate.yellowCards += Number(player.metrics.yellow_cards) || 0;
      aggregate.redCards += Number(player.metrics.red_cards) || 0;
      const rating = Number(player.metrics.player_grade);
      if (Number.isFinite(rating)) aggregate.ratings.push(rating);
    }
  }
  return [...index.values()]
    .map((player) => ({
      ...player,
      averageRating: player.ratings.length
        ? Math.round((player.ratings.reduce((sum, value) => sum + value, 0) / player.ratings.length) * 100) / 100
        : null,
      ratedMatches: player.ratings.length,
      ratings: undefined,
    }))
    .sort((left, right) => left.playerName.localeCompare(right.playerName, "fr"));
}

function officialPeriods(statisticsRepository) {
  const result = {};
  for (const [key, period] of Object.entries(statisticsRepository?.periods ?? {})) {
    const metrics = {};
    for (const [metricKey, metric] of Object.entries(period?.team?.metrics ?? {})) {
      metrics[metricKey] = {
        value: metric?.value ?? null,
        status: metric?.status ?? "unavailable",
        source: metric?.source ?? null,
        sourceType: metric?.sourceType ?? null,
      };
    }
    result[key] = {
      label: period?.label ?? key,
      seasonIds: period?.seasonIds ?? [],
      officialAggregate: period?.team?.officialAggregate === true,
      metrics,
    };
  }
  return result;
}

function linkTournamentContainers(tournamentEvents, matchEvents) {
  const links = new Map();
  for (const tournament of tournamentEvents) {
    if (tournament.is_cancelled === true) continue;
    const candidates = matchEvents.filter(
      (match) =>
        String(match.seasonId) === String(tournament.seasonId) &&
        toIsoDay(match.start_at) === toIsoDay(tournament.start_at) &&
        isTournamentSummaryMatch(match),
    );
    if (candidates.length === 1) links.set(String(tournament.id), String(candidates[0].id));
  }
  return links;
}

export function buildMatchRepository({
  teamId,
  seasons,
  eventsBySeason,
  statisticsByEvent,
  detailsByEvent = new Map(),
  uiByEvent,
  playersRepository,
  calendarUiCapture = null,
  statisticsRepository = null,
  syncedAt = new Date().toISOString(),
}) {
  const playersById = new Map(
    (playersRepository?.players ?? []).map((player) => [String(player.sporteasyId), player]),
  );
  const calendarEvents = [];
  for (const season of seasons) {
    const seasonId = String(season.id);
    for (const event of eventsBySeason.get(seasonId) ?? []) {
      calendarEvents.push({ ...event, seasonId });
    }
  }
  const matchEvents = calendarEvents.filter(isStatisticalMatchEvent);
  const tournamentEvents = calendarEvents.filter((event) => event.category?.type === "tournament");
  const internalTrainingEvents = calendarEvents.filter(isInternalTrainingEvent);
  const tournamentLinks = linkTournamentContainers(tournamentEvents, matchEvents);
  const tournamentByMatchId = new Map(
    [...tournamentLinks].map(([tournamentId, matchId]) => [matchId, tournamentId]),
  );
  const matches = matchEvents.map((event) =>
    ({
      ...normalizeMatch({
      event,
      statsPayload: statisticsByEvent.get(String(event.id)) ?? null,
      eventDetails: detailsByEvent.get(String(event.id)) ?? null,
      uiCapture: uiByEvent.get(String(event.id)) ?? null,
      playersById,
      }),
      tournamentContainerId: tournamentByMatchId.get(String(event.id)) ?? null,
    }),
  );
  matches.sort((left, right) => String(left.startAt).localeCompare(String(right.startAt)));
  const tournamentContainers = tournamentEvents.map((event) => {
    const normalized = normalizeMatch({
      event,
      statsPayload: statisticsByEvent.get(String(event.id)) ?? null,
      eventDetails: detailsByEvent.get(String(event.id)) ?? null,
      uiCapture: uiByEvent.get(String(event.id)) ?? null,
      playersById,
    });
    const linkedMatchEventId = tournamentLinks.get(String(event.id)) ?? null;
    const linkedMatch = linkedMatchEventId
      ? matches.find((match) => match.eventId === linkedMatchEventId) ?? null
      : null;
    return {
      ...normalized,
      linkedMatchEventId,
      linkedMatchName: linkedMatch?.name ?? null,
      relationshipStatus:
        event.is_cancelled === true
          ? "cancelled"
          : linkedMatchEventId
            ? "linked"
            : "unlinked_no_summary_match",
    };
  });

  const completedMatches = matches.filter(
    (match) => match.status.isPast && !match.status.isCancelled && match.status.hasCompleteScore,
  );
  const allTime = emptyAggregate("all", "Toutes saisons");
  for (const match of matches.filter((item) => item.status.isPast && !item.status.isCancelled)) {
    addMatch(allTime, match);
  }
  const seasonSummaries = aggregateBy(matches, (match) => match.seasonId, (match) =>
    seasons.find((season) => String(season.id) === match.seasonId)?.name ?? match.seasonId,
  );
  const currentUiSeason = calendarUiCapture?.seasons?.find(
    (season) => season.name === seasons.find((item) => item.current === true)?.name,
  );
  const structuredCalendarIds = new Set(calendarEvents.map((event) => String(event.id)));
  const currentUiEventIds = new Set(
    (currentUiSeason?.events ?? [])
      .map((event) => /\/event\/(\d+)\//.exec(event?.href ?? "")?.[1] ?? null)
      .filter(Boolean),
  );
  const currentSeasonUiOnlyCount = [...currentUiEventIds].filter(
    (eventId) => !structuredCalendarIds.has(eventId),
  ).length;

  return {
    metadata: {
      source: "SportEasy",
      syncedAt,
      validationStatus:
        matches.every((match) => match.capture.uiErrors.length === 0) ? "valid" : "incomplete",
      teamId: String(teamId),
      seasonCount: seasons.length,
      calendarEventCount: calendarEvents.length,
      currentSeasonUiEventCount: currentUiEventIds.size,
      currentSeasonUiOnlyCount,
      calendarKnownEventCount: calendarEvents.length + currentSeasonUiOnlyCount,
      matchEventCount: matches.length,
      nonCancelledMatchEventCount: matches.filter((match) => !match.status.isCancelled).length,
      sportEasyDashboardMatchCount:
        matches.filter((match) => !match.status.isCancelled).length +
        internalTrainingEvents.filter(
          (event) => event.category?.type === "challenge_match" && event.is_cancelled !== true,
        ).length,
      statisticalMatchCount: matches.filter((match) => !match.status.isCancelled).length,
      pastNonCancelledMatchCount: matches.filter(
        (match) => match.status.isPast && !match.status.isCancelled,
      ).length,
      completedMatchCount: completedMatches.length,
      statisticsCaptureCount: matches.filter((match) => match.capture.statistics).length,
      eventDetailsCaptureCount: matches.filter((match) => match.capture.eventDetails).length,
      ratedEventCount: matches.filter((match) => match.eventRating).length,
      uiCaptureCount: matches.filter(
        (match) => match.capture.summary && match.capture.presence && match.capture.report,
      ).length,
      populatedReportCount: matches.filter((match) => match.report).length,
      internalTrainingEventCount: internalTrainingEvents.length,
      tournamentContainerCount: tournamentContainers.length,
      linkedTournamentContainerCount: tournamentContainers.filter(
        (container) => container.relationshipStatus === "linked",
      ).length,
      unlinkedTournamentContainerCount: tournamentContainers.filter(
        (container) => container.relationshipStatus === "unlinked_no_summary_match",
      ).length,
    },
    seasons: seasons.map((season) => ({
      id: String(season.id),
      name: season.name,
      startDate: season.start_date,
      endDate: season.end_date,
      current: season.current === true,
      archived: season.archived === true,
    })),
    calendar: {
      events: calendarEvents,
      currentSeasonUiEvents: currentUiSeason?.events ?? [],
      internalTrainingEvents,
    },
    matches,
    tournaments: {
      containers: tournamentContainers,
      links: tournamentContainers
        .filter((container) => container.linkedMatchEventId)
        .map((container) => ({
          tournamentContainerId: container.eventId,
          tournamentName: container.name,
          matchEventId: container.linkedMatchEventId,
          matchName: container.linkedMatchName,
          day: container.day,
        })),
    },
    aggregates: {
      officialPeriods: officialPeriods(statisticsRepository),
      allTime,
      seasons: seasonSummaries,
      opponents: aggregateBy(
        completedMatches,
        (match) => match.opponent?.id ?? `name:${match.opponent?.name}`,
        (match) => match.opponent?.name ?? "Adversaire inconnu",
      ),
      venues: aggregateBy(
        completedMatches,
        (match) => match.venue?.id ?? (match.venue?.name ? `name:${match.venue.name}` : null),
        (match) => match.venue?.name ?? "Lieu inconnu",
      ),
      categories: aggregateBy(
        completedMatches,
        (match) => match.category.id ?? `slug:${match.category.slug}`,
        (match) => match.category.name ?? match.category.slug ?? "Catégorie inconnue",
      ),
      months: aggregateBy(completedMatches, (match) => match.day?.slice(0, 7)),
      players: playerAggregates(matches, playersById),
    },
  };
}

export { MATCH_TYPES };
