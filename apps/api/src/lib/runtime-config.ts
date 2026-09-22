/**
 * Runtime configuration helpers for medusa-config.ts. Kept here, apart from
 * the config file, so the production rules are unit-testable.
 */

type Env = Record<string, string | undefined>

type ModuleConfig = {
  resolve: string
  options: Record<string, unknown>
}

const LOCAL_DEFAULT_SECRET = "supersecret"

/**
 * Read a signing secret. Outside production a well-known default keeps local
 * setup frictionless; in production a missing value is fatal, because falling
 * back to a public default would let anyone forge sessions signed with it.
 */
export function requireSecret(name: string, env: Env = process.env): string {
  const value = env[name]
  if (value) {
    return value
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      `${name} must be set in production. Refusing to start with a default signing secret.`
    )
  }
  return LOCAL_DEFAULT_SECRET
}

/**
 * Medusa modules that move the event bus, workflow engine and locking onto
 * Redis. Without them Medusa uses in-process defaults: events and workflow
 * state are lost on restart, and locks only hold within one process.
 *
 * Returns nothing without a URL, so local development keeps the in-memory
 * defaults and needs no Redis.
 */
export function redisModules(redisUrl: string | undefined): ModuleConfig[] {
  if (!redisUrl) {
    return []
  }

  return [
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl } },
    },
    {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl },
          },
        ],
      },
    },
  ]
}
