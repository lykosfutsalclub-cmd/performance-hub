import { buildPlayerRepository } from "./players-repository.mjs";

export async function synchronizePlayerRepository({
  client,
  seasonsRequest,
  currentProfilesRequest,
  archivedProfilesRequest,
  previousRepository = null,
  publish,
  now = () => new Date(),
}) {
  const seasonsCollection = await client.getJsonCollection(seasonsRequest.endpoint, {
    version: seasonsRequest.version,
  });

  const currentProfilesPromise = client.getJsonCollection(currentProfilesRequest.endpoint, {
    version: currentProfilesRequest.version,
  });
  const archivedProfilesPromise = client.getJsonCollection(archivedProfilesRequest.endpoint, {
    version: archivedProfilesRequest.version,
  });

  const [currentProfilesCollection, archivedProfilesCollection] = await Promise.all([
    currentProfilesPromise,
    archivedProfilesPromise,
  ]);

  const repository = buildPlayerRepository({
    rawSeasons: seasonsCollection.items,
    rawCurrentProfiles: currentProfilesCollection.items,
    rawArchivedProfiles: archivedProfilesCollection.items,
    previousRepository,
    syncedAt: now().toISOString(),
  });

  await publish(repository);
  return repository;
}
