import crypto from "crypto"

/**
 * Encryption at rest for third-party integration secrets (API keys, tokens).
 *
 * AES-256-GCM with a random 12-byte IV per value. Stored format:
 *   enc:v1:<iv b64>:<auth tag b64>:<ciphertext b64>
 *
 * The 32-byte key comes from INTEGRATION_ENCRYPTION_KEY (base64 or 64-char
 * hex). Production refuses to run without it. Elsewhere a fixed development
 * key is used so local setup and tests need no configuration; data encrypted
 * with it is not secret and must never reach production.
 */

const PREFIX = "enc:v1:"
const KEY_ENV = "INTEGRATION_ENCRYPTION_KEY"
const DEV_KEY_SEED = "mercur-development-integration-key"
const MASK = "••••"

type Env = Record<string, string | undefined>

export function resolveIntegrationEncryptionKey(env: Env = process.env): Buffer {
  const raw = env[KEY_ENV]?.trim()

  if (raw) {
    const key = /^[0-9a-f]{64}$/i.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64")
    if (key.length !== 32) {
      throw new Error(
        `${KEY_ENV} must decode to 32 bytes (base64 or 64 hex characters).`
      )
    }
    return key
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      `${KEY_ENV} must be set in production to encrypt integration credentials.`
    )
  }

  return crypto.createHash("sha256").update(DEV_KEY_SEED).digest()
}

export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX)
}

export function encryptSecret(plain: string, key?: Buffer): string {
  const k = key ?? resolveIntegrationEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`
}

export function decryptSecret(value: string, key?: Buffer): string {
  if (!isEncryptedSecret(value)) {
    throw new Error("Value is not an encrypted secret.")
  }
  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(":")
  if (!ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error("Encrypted secret is malformed.")
  }
  const k = key ?? resolveIntegrationEncryptionKey()
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    k,
    Buffer.from(ivB64, "base64")
  )
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

export function encryptJson(value: unknown, key?: Buffer): string {
  return encryptSecret(JSON.stringify(value), key)
}

export function decryptJson<T>(value: string, key?: Buffer): T {
  return JSON.parse(decryptSecret(value, key)) as T
}

/** `••••` plus the last 4 characters (only `••••` for short values). */
export function maskSecret(value: string): string {
  return value.length > 8 ? `${MASK}${value.slice(-4)}` : MASK
}

/** True when a client echoed back a masked value instead of a new secret. */
export function isMaskedSecret(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(MASK)
}
