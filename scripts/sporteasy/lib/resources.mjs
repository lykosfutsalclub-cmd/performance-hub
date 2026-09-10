const enabled = (description, buildEndpoint, version = "2.1") =>
  Object.freeze({ enabled: true, description, buildEndpoint, version });

const disabled = (description, reason) =>
  Object.freeze({ enabled: false, description, reason });

export const resources = Object.freeze({
  team: enabled("Informations générales de l'équipe", ({ teamId }) => `teams/${teamId}/`),
  seasons: enabled("Saisons disponibles pour l'équipe", ({ teamId }) => `teams/${teamId}/seasons/`),
  profiles: enabled(
    "Effectif et profils de l'équipe",
    ({ teamId }) => `teams/${teamId}/profiles/`,
    "2.3",
  ),
  archivedProfiles: enabled(
    "Anciens profils archivés de l'équipe",
    ({ teamId }) => `teams/${teamId}/profiles/?archived=1`,
    "2.3",
  ),
  events: enabled(
    "Liste des événements de l'équipe",
    ({ teamId }) => `teams/${teamId}/events/?web=1`,
  ),
  attendance: enabled(
    "Résumé des présences de l'équipe",
    ({ teamId }) => `teams/${teamId}/stats/presences/summary/`,
  ),
  teamStats: disabled(
    "Statistiques globales d'une saison et catégorie",
    "TODO : confirmer seasonCategoryId et season_slug_name avant activation.",
  ),
  playerStats: disabled(
    "Statistiques des joueurs d'une saison et catégorie",
    "TODO : confirmer seasonCategoryId, season_slug_name, group et role avant activation.",
  ),
});

export function getResource(name) {
  return Object.hasOwn(resources, name) ? resources[name] : null;
}

export function printResourceList() {
  console.log("Ressources SportEasy autorisées :");
  for (const [name, resource] of Object.entries(resources)) {
    const state = resource.enabled ? "active" : "désactivée";
    console.log(`- ${name} (${state}) : ${resource.description}`);
    if (!resource.enabled) console.log(`  ${resource.reason}`);
  }
}
