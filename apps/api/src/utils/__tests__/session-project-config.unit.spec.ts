const {
  DEFAULT_SESSION_TTL_MS,
  resolveSessionProjectConfig,
} = require("../../../session-project-config")

describe("resolveSessionProjectConfig", () => {
  it("wires redisUrl from REDIS_URL for persistent sessions", () => {
    const config = resolveSessionProjectConfig({
      REDIS_URL: "redis://localhost:6379",
    })

    expect(config.redisUrl).toBe("redis://localhost:6379")
  })

  it("enables rolling sessions with a 7-day TTL", () => {
    const config = resolveSessionProjectConfig({
      REDIS_URL: "redis://localhost:6379",
    })

    expect(config.sessionOptions).toEqual({
      rolling: true,
      ttl: DEFAULT_SESSION_TTL_MS,
    })
    expect(DEFAULT_SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it("leaves redisUrl undefined when REDIS_URL is missing", () => {
    const config = resolveSessionProjectConfig({})

    expect(config.redisUrl).toBeUndefined()
  })
})
