import { redisModules, requireSecret } from "../runtime-config"

describe("requireSecret", () => {
  it("returns the configured value", () => {
    expect(
      requireSecret("JWT_SECRET", { JWT_SECRET: "real", NODE_ENV: "production" })
    ).toBe("real")
  })

  it("refuses to start in production without the secret", () => {
    // Falling back to a public default in production would let anyone forge
    // sessions signed with it.
    expect(() =>
      requireSecret("JWT_SECRET", { NODE_ENV: "production" })
    ).toThrow(/JWT_SECRET/)
    expect(() =>
      requireSecret("COOKIE_SECRET", { NODE_ENV: "production", COOKIE_SECRET: "" })
    ).toThrow(/COOKIE_SECRET/)
  })

  it("keeps a local default outside production", () => {
    expect(requireSecret("JWT_SECRET", { NODE_ENV: "development" })).toBe(
      "supersecret"
    )
    expect(requireSecret("JWT_SECRET", {})).toBe("supersecret")
  })
})

describe("redisModules", () => {
  it("adds nothing without a Redis URL, so local dev keeps in-memory defaults", () => {
    expect(redisModules(undefined)).toEqual([])
    expect(redisModules("")).toEqual([])
  })

  it("wires the event bus, workflow engine and locking to Redis", () => {
    const url = "redis://127.0.0.1:6379"
    const modules = redisModules(url)

    expect(modules).toEqual(
      expect.arrayContaining([
        {
          resolve: "@medusajs/medusa/event-bus-redis",
          options: { redisUrl: url },
        },
        {
          resolve: "@medusajs/medusa/workflow-engine-redis",
          options: { redis: { redisUrl: url } },
        },
        {
          resolve: "@medusajs/medusa/locking",
          options: {
            providers: [
              {
                resolve: "@medusajs/medusa/locking-redis",
                id: "locking-redis",
                is_default: true,
                options: { redisUrl: url },
              },
            ],
          },
        },
      ])
    )
    expect(modules).toHaveLength(3)
  })
})
