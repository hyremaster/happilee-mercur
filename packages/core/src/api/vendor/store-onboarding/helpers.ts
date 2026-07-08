import { AuthenticatedMedusaRequest } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MercurModules, StoreOnboardingDraftDTO } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"

// Credential fields that must never be returned in an API response.
const SECRET_CREDENTIAL_KEYS = ["key_secret", "webhook_secret"]
const MASKED = "***"

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)

/** Replace secret credential values with a mask (keeps public fields like key_id). */
export function maskCredentials(credentials: unknown): unknown {
  if (!isObject(credentials)) {
    return credentials
  }
  const out: Record<string, unknown> = { ...credentials }
  for (const key of SECRET_CREDENTIAL_KEYS) {
    if (out[key] != null) {
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
