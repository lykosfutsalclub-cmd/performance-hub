function positiveId(value, label) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) throw new Error(`${label} invalide.`);
  return text;
}

function reportValue(report) {
  for (const key of ["text", "content", "description", "report"]) {
    if (typeof report?.[key] === "string") return report[key].trim();
  }
  return "";
}

export function buildApiEquivalentMatchCapture({ event, statistics, report, capturedAt }) {
  const eventId = positiveId(event?.id, "Identifiant du match");
  const seasonId = positiveId(event?.season?.id, "Identifiant de saison");
  if (event?.is_past !== true || event?.is_cancelled === true) {
    throw new Error("La capture équivalente est réservée à un match passé non annulé.");
  }
  if (!statistics || typeof statistics !== "object") {
    throw new Error("Les statistiques du match sont absentes.");
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("La réponse du compte rendu est invalide.");
  }

  const entries = [];
  const seen = new Set();
  for (const group of event.attendees ?? []) {
    const groupStatus = group?.attendance_status === "present"
      ? "present"
      : group?.attendance_status === "absent"
        ? "absent"
        : "";
    for (const attendee of group?.results ?? []) {
      const profileId = positiveId(attendee?.profile?.id, "Identifiant de présence");
      const status = String(attendee?.presence?.slug_name ?? groupStatus).trim();
      if (!status) throw new Error(`Statut de présence absent pour ${profileId}.`);
      if (seen.has(profileId)) throw new Error(`Présence dupliquée pour ${profileId}.`);
      seen.add(profileId);
      entries.push({ profileId, status });
    }
  }
  const expectedAttendanceCount = (event.attendance_groups ?? [])
    .reduce((total, group) => total + (Number.isInteger(group?.count) ? group.count : 0), 0);
  if (!entries.length || entries.length !== expectedAttendanceCount) {
    throw new Error(`Présences incomplètes : ${entries.length}/${expectedAttendanceCount}.`);
  }

  const base = `https://api.sporteasy.net/v2.1/teams/${positiveId(process.env.SPORTEASY_TEAM_ID, "Identifiant d’équipe")}/events/${eventId}`;
  const score = statistics?.opponents?.flatMap((category) => category?.stats ?? [])
    .find((metric) => metric?.slug_name === "score");
  const formValues = entries.map(({ profileId, status }) => ({
    ariaLabel: null,
    checked: true,
    name: `presence_group_${profileId}`,
    tag: "INPUT",
    type: "radio",
    value: status,
  }));
  const capturedReport = reportValue(report);

  return {
    eventId,
    seasonId,
    categoryType: event?.category?.type ?? null,
    categorySlug: event?.category?.slug_name ?? null,
    capturedAt,
    captureMethod: "sporteasy-api-readonly-equivalent",
    sourceEndpoints: {
      summary: `GET /v2.1/teams/{teamId}/events/${eventId}/stats/`,
      presence: `GET /v2.1/teams/{teamId}/events/${eventId}/`,
      report: `GET /v2.1/teams/{teamId}/events/${eventId}/report/`,
    },
    evidence: {
      attendanceCount: entries.length,
      presentCount: (event.attendance_groups ?? []).find((group) => group?.attendance_status === "present")?.count ?? null,
      absentCount: (event.attendance_groups ?? []).find((group) => group?.attendance_status === "absent")?.count ?? null,
      playerStatisticsCount: Array.isArray(statistics.players) ? statistics.players.length : 0,
      score: { team: score?.value_left ?? null, opponent: score?.value_right ?? null },
      reportPresent: Boolean(capturedReport),
    },
    routes: {
      summary: { url: `${base}/stats/`, dom: "Capture structurée depuis l’API SportEasy en lecture seule.", formValues: [] },
      presence: { url: `${base}/`, dom: "Présences structurées depuis l’API SportEasy en lecture seule.", formValues },
      report: {
        url: `${base}/report/`,
        dom: "Compte rendu structuré depuis l’API SportEasy en lecture seule.",
        formValues: [{ ariaLabel: null, checked: false, name: null, tag: "TEXTAREA", type: null, value: capturedReport }],
      },
    },
    errors: [],
  };
}
