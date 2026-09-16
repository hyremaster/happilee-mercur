import crypto from "crypto"

import { AuthenticatedMedusaRequest } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  MercurModules,
  StoreOnboardingDraftDTO,
  StorePaymentGatewayType,
} from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"

// Credential fields that must never be returned in an API response.
const SECRET_CREDENTIAL_KEYS = ["key_secret", "webhook_secret"]

// Character used to blank out the interior of a masked secret. Real secrets are
// ASCII (Razorpay keys, webhook secrets), so a value containing this bullet is a
// reliable signal that the client is echoing a masked read back to us.
const MASK_CHAR = "•" // •
export const MASKED = MASK_CHAR.repeat(3)

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)

/**
 * Mask a secret while preserving its real length and revealing the first and
 * last character (e.g. "super-secret-value" -> "s••••••••••••••••e"). Secrets of
 * length <= 2 are fully bulleted so nothing is leaked. Length is preserved so
 * the client can tell a 6-char secret from a 40-char one instead of always
 * seeing "***".
 */
export function maskSecretValue(value: string): string {
  const len = value.length
  if (len === 0) {
    return ""
  }
  if (len <= 2) {
    return MASK_CHAR.repeat(len)
  }
  return value[0] + MASK_CHAR.repeat(len - 2) + value[len - 1]
}

/** True if a value is a masked secret (contains the mask bullet), not a real one. */
export function isMaskedSecret(value: unknown): boolean {
  return typeof value === "string" && value.includes(MASK_CHAR)
}

// Razorpay read endpoint that requires valid key auth. `count=1` keeps the
// response tiny — we only care about the status code, not the body.
const RAZORPAY_VALIDATE_URL = "https://api.razorpay.com/v1/payments?count=1"

/**
 * Verify a Razorpay key_id / key_secret pair actually authenticates by calling
 * a read endpoint with HTTP Basic auth. Razorpay returns 401 for bad keys.
 * Throws INVALID_DATA on invalid credentials or if Razorpay is unreachable, so
 * a store can never save credentials that don't work.
 */
export async function validateRazorpayCredentials(
  keyId: string,
  keySecret: string
): Promise<void> {
  if (!keyId || !keySecret) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Razorpay key ID and secret are required."
    )
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")

  let response: Response
  try {
    response = await fetch(RAZORPAY_VALIDATE_URL, {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
    })
  } catch {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Could not reach Razorpay to validate the credentials. Please try again."
    )
  }

  if (response.status === 401 || response.status === 400) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid Razorpay API key or secret. Please check the credentials and try again."
    )
  }

  if (!response.ok) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Could not validate Razorpay credentials (status ${response.status}). Please try again.`
    )
  }
}

/**
 * Validate a gateway's credentials against the provider before persisting.
 * No-op for a masked secret (the client is round-tripping an unchanged read).
 * Currently only Razorpay is supported; other gateways pass through.
 */
export async function validateGatewayCredentials(
  gateway: string,
  credentials: { key_id?: unknown; key_secret?: unknown } | null | undefined
): Promise<void> {
  if (!credentials || isMaskedSecret(credentials.key_secret)) {
    return
  }
  if (gateway === StorePaymentGatewayType.RAZORPAY) {
    const keyId =
      typeof credentials.key_id === "string" ? credentials.key_id : ""
    const keySecret =
      typeof credentials.key_secret === "string" ? credentials.key_secret : ""
    await validateRazorpayCredentials(keyId, keySecret)
  }
}

// Events our webhook handler acts on. Razorpay's v1 API expects an object map.
const RAZORPAY_WEBHOOK_EVENTS: Record<string, boolean> = {
  "payment.authorized": true,
  "payment.captured": true,
  "payment.failed": true,
}

// The provider segment Medusa prepends `pp_` to; must resolve to the registered
// provider id `pp_razorpay_razorpay`.
const RAZORPAY_WEBHOOK_PATH = "/hooks/payment/razorpay_razorpay"

/** Generate a fresh Razorpay webhook signing secret. */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("hex")}`
}

/**
 * Public webhook URL Razorpay should call. Derived from BACKEND_PUBLIC_URL
 * (e.g. https://ecom.happilee.io). Returns null when unset so callers can
 * skip auto-registration (e.g. local dev where Razorpay can't reach the host).
 */
export function getRazorpayWebhookUrl(): string | null {
  const base = process.env.BACKEND_PUBLIC_URL?.replace(/\/+$/, "")
  if (!base) {
    return null
  }
  return `${base}${RAZORPAY_WEBHOOK_PATH}`
}

/**
 * Register (or update) our webhook on the seller's Razorpay account so payment
 * events reach the marketplace. Idempotent: matches an existing webhook by URL
 * and updates it (secret/events), otherwise creates one. Leaves the seller's
 * other webhooks (e.g. their own app integration) untouched. Returns the
 * Razorpay webhook id. Throws INVALID_DATA on a hard API failure.
 */
export async function syncRazorpayWebhook(
  keyId: string,
  keySecret: string,
  url: string,
  secret: string
): Promise<string> {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64")
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  }

  // Find an existing webhook with the same URL to avoid duplicates.
  let existingId: string | undefined
  try {
    const listRes = await fetch(
      "https://api.razorpay.com/v1/webhooks?count=100",
      { headers }
    )
    if (listRes.ok) {
      const body = (await listRes.json()) as {
        items?: { id: string; url: string }[]
      }
      existingId = body.items?.find((w) => w.url === url)?.id
    }
  } catch {
    // Non-fatal: fall through and attempt to create.
  }

  const payload = JSON.stringify({
    url,
    secret,
    events: RAZORPAY_WEBHOOK_EVENTS,
    active: true,
  })
  const target = existingId
    ? `https://api.razorpay.com/v1/webhooks/${existingId}`
    : "https://api.razorpay.com/v1/webhooks"
  const method = existingId ? "PUT" : "POST"

  let res: Response
  try {
    res = await fetch(target, { method, headers, body: payload })
  } catch {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Could not reach Razorpay to register the webhook. Please try again."
    )
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Could not register the Razorpay webhook (status ${res.status}). ${errText.slice(0, 300)}`
    )
  }

  const created = (await res.json()) as { id: string }
  return created.id
}

/**
 * Prepare Razorpay gateway credentials for persistence: ensure a webhook_secret
 * exists (reuse the caller-supplied or previously-stored one, else generate a
 * random one) and register/refresh the webhook on the seller's Razorpay account
 * so it points at our URL with that secret.
 *
 * Returns the credentials to store (with webhook_secret) plus metadata to merge
 * (razorpay_webhook_id / _url). No-op passthrough for non-Razorpay gateways or
 * masked (unchanged) credentials. Best-effort: when BACKEND_PUBLIC_URL is unset
 * we still stamp a secret so it can be wired up manually, but skip the API call.
 */
export async function prepareRazorpayGatewayCredentials(
  gateway: string,
  credentials: Record<string, unknown> | null | undefined,
  previousWebhookSecret?: string
): Promise<{
  credentials: Record<string, unknown> | null | undefined
  metadata: Record<string, unknown>
}> {
  if (
    gateway !== StorePaymentGatewayType.RAZORPAY ||
    !isObject(credentials) ||
    isMaskedSecret(credentials.key_secret)
  ) {
    return { credentials, metadata: {} }
  }

  const keyId = typeof credentials.key_id === "string" ? credentials.key_id : ""
  const keySecret =
    typeof credentials.key_secret === "string" ? credentials.key_secret : ""

  // Reuse an explicitly-provided secret, then a previously-stored one, else mint.
  const provided =
    typeof credentials.webhook_secret === "string" &&
    credentials.webhook_secret &&
    !isMaskedSecret(credentials.webhook_secret)
      ? (credentials.webhook_secret as string)
      : undefined
  const webhookSecret = provided ?? previousWebhookSecret ?? generateWebhookSecret()

  const outCredentials: Record<string, unknown> = {
    ...credentials,
    webhook_secret: webhookSecret,
  }

  const url = getRazorpayWebhookUrl()
  if (!url) {
    return { credentials: outCredentials, metadata: {} }
  }

  const webhookId = await syncRazorpayWebhook(keyId, keySecret, url, webhookSecret)
  return {
    credentials: outCredentials,
    metadata: { razorpay_webhook_id: webhookId, razorpay_webhook_url: url },
  }
}

/**
 * Validate every payment gateway embedded in a wizard step-3 (fulfillment)
 * payload before it is stored on the draft. Accepts the loose `data` object
 * with `payment_gateway` (singular) and/or `payment_gateways` (array). Masked
 * secrets are skipped (unchanged round-trip).
 */
export async function validateDraftPaymentGateways(
  data: unknown
): Promise<void> {
  if (!isObject(data)) {
    return
  }
  const entries: unknown[] = []
  if (Array.isArray(data.payment_gateways)) {
    entries.push(...data.payment_gateways)
  }
  if (data.payment_gateway) {
    entries.push(data.payment_gateway)
  }
  for (const entry of entries) {
    if (!isObject(entry)) {
      continue
    }
    const gateway = typeof entry.gateway === "string" ? entry.gateway : ""
    const credentials = isObject(entry.credentials)
      ? entry.credentials
      : undefined
    await validateGatewayCredentials(gateway, credentials)
  }
}

/** Replace secret credential values with a mask (keeps public fields like key_id). */
export function maskCredentials(credentials: unknown): unknown {
  if (!isObject(credentials)) {
    return credentials
  }
  const out: Record<string, unknown> = { ...credentials }
  for (const key of SECRET_CREDENTIAL_KEYS) {
    const value = out[key]
    if (typeof value === "string") {
      out[key] = maskSecretValue(value)
    } else if (value != null) {
      out[key] = MASKED
    }
  }
  return out
}

/** Mask the `credentials` of a store_payment_gateway row for safe return. */
export function maskGateway<T>(gateway: T): T {
  if (!isObject(gateway)) {
    return gateway
  }
  return { ...gateway, credentials: maskCredentials(gateway.credentials) } as T
}

/**
 * Mask any payment-gateway credentials embedded in a draft's `draft_data`
 * (step 3 saves `fulfillment.payment_gateway` loosely). Returns a shallow copy
 * so the stored value is untouched.
 */
export function maskDraftData(draftData: unknown): unknown {
  if (!isObject(draftData)) {
    return draftData
  }
  const data: Record<string, unknown> = { ...draftData }

  const maskGatewayField = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(maskGateway) : maskGateway(v)

  const fulfillment = data.fulfillment
  if (isObject(fulfillment)) {
    const next = { ...fulfillment }
    let changed = false
    if (next.payment_gateway) {
      next.payment_gateway = maskGatewayField(next.payment_gateway)
      changed = true
    }
    if (next.payment_gateways) {
      next.payment_gateways = maskGatewayField(next.payment_gateways)
      changed = true
    }
    if (changed) {
      data.fulfillment = next
    }
  }
  if (data.payment_gateway) {
    data.payment_gateway = maskGatewayField(data.payment_gateway)
  }
  if (data.payment_gateways) {
    data.payment_gateways = maskGatewayField(data.payment_gateways)
  }
  return data
}

/**
 * Enforce the single-active-per-gateway invariant before activating a row:
 * deactivate every other active account of the same (seller_id, gateway).
 * `exceptId` (the row about to be activated) is left untouched. Call this
 * BEFORE the activating write so the partial-unique index never rejects two
 * simultaneously-active rows.
 */
export async function deactivateSiblingGateways(
  service: MarketplaceProfileModuleService,
  sellerId: string,
  gateway: string,
  exceptId?: string
): Promise<void> {
  const active = await service.listStorePaymentGateways({
    seller_id: sellerId,
    gateway,
    is_active: true,
  })
  const stale = active.filter((g) => g.id !== exceptId)
  for (const g of stale) {
    await service.updateStorePaymentGateways({ id: g.id, is_active: false })
  }
}

/**
 * Prepare a single draft for return to the vendor SPA: mask any embedded
 * payment-gateway credentials in `draft_data` AND drop the secret
 * `happilee_api_key` column (seeded server-side from SSO, must never reach the
 * client). Use this in every draft response instead of spreading the raw row.
 */
export function sanitizeDraft<
  T extends { draft_data?: unknown; happilee_api_key?: unknown },
>(draft: T): Omit<T, "happilee_api_key"> {
  const { happilee_api_key: _secret, ...rest } = draft
  return { ...rest, draft_data: maskDraftData(draft.draft_data) }
}

/** Sanitize every draft in a list before returning. */
export function maskDrafts<
  T extends { draft_data?: unknown; happilee_api_key?: unknown },
>(drafts: T[]): Omit<T, "happilee_api_key">[] {
  return drafts.map(sanitizeDraft)
}

/**
 * Drop the secret `happilee_api_key` column from a store_profile before it is
 * returned to the vendor SPA. The key is a backend credential for the Happilee
 * Area Sense API and must never reach the client. Pass-through for null.
 */
export function sanitizeStoreProfile<
  T extends { happilee_api_key?: unknown },
>(profile: T | null | undefined): Omit<T, "happilee_api_key"> | null {
  if (!profile) {
    return null
  }
  const { happilee_api_key: _secret, ...rest } = profile
  return rest
}

/**
 * Store-onboarding routes are exempt from the global vendor `ensureSeller`
 * guard (a vendor creates new sellers, so there is no single seller header).
 * Each handler instead verifies the authenticated member owns the target store
 * (= seller) via the seller_member link. Returns the member id.
 */
export async function assertStoreOwnership(
  req: AuthenticatedMedusaRequest,
  sellerId: string
): Promise<string> {
  const memberId = req.auth_context?.actor_id

  if (!memberId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You must be authenticated."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sellerMembers } = await query.graph({
    entity: "seller_member",
    fields: ["id"],
    filters: { seller_id: sellerId, member_id: memberId },
  })

  if (!sellerMembers.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You are not a member of this store."
    )
  }

  return memberId
}

/**
 * Load a draft and verify it belongs to the authenticated member. Returns the
 * draft so the handler can read its state.
 */
export async function assertDraftOwnership(
  req: AuthenticatedMedusaRequest,
  draftId: string
): Promise<StoreOnboardingDraftDTO> {
  const authIdentityId = req.auth_context?.auth_identity_id

  if (!authIdentityId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You must be authenticated."
    )
  }

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  let draft: StoreOnboardingDraftDTO | undefined
  try {
    draft = await service.retrieveStoreOnboardingDraft(draftId)
  } catch {
    draft = undefined
  }

  if (!draft || draft.auth_identity_id !== authIdentityId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Draft not found.")
  }

  return draft
}
