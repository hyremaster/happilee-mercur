/** Default vendor/admin session lifetime: 7 days. */
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Session store settings for Medusa `projectConfig`.
 * `redisUrl` must be set so auth cookies survive API process restarts.
 */
function resolveSessionProjectConfig(env) {
  return {
    redisUrl: env.REDIS_URL,
    sessionOptions: {
      rolling: true,
      ttl: DEFAULT_SESSION_TTL_MS,
    },
  }
}

module.exports = {
  DEFAULT_SESSION_TTL_MS,
  resolveSessionProjectConfig,
}
