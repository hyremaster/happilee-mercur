/** Lock key shared by every sync of one stream for one store connection. */
export const syncLockKey = (sellerId: string, providerId: string, stream: string) =>
  `integration-sync:${sellerId}:${providerId}:${stream}`
