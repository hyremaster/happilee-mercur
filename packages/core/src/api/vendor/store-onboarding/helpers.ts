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
 * (step 3 saves `fulfillment.payment_gateways` / legacy `payment_gateway`).
 * Returns a shallow copy so the stored value is untouched.
 */
export function maskDraftData(draftData: unknown): unknown {
  if (!isObject(draftData)) {
    return draftData
  }
  const data: Record<string, unknown> = { ...draftData }

  const fulfillment = data.fulfillment
  if (isObject(fulfillment)) {
    const nextFulfillment: Record<string, unknown> = { ...fulfillment }

    if (Array.isArray(fulfillment.payment_gateways)) {
      nextFulfillment.payment_gateways =
        fulfillment.payment_gateways.map(maskGateway)
    }
    if (fulfillment.payment_gateway) {
      nextFulfillment.payment_gateway = maskGateway(fulfillment.payment_gateway)
    }

    data.fulfillment = nextFulfillment
  }

  if (Array.isArray(data.payment_gateways)) {
    data.payment_gateways = data.payment_gateways.map(maskGateway)
  }
  if (data.payment_gateway) {
    data.payment_gateway = maskGateway(data.payment_gateway)
  }
  return data
}

const isMaskedSecret = (value: unknown): boolean => value === MASKED

/**
 * When re-saving step 3, clients may echo masked secrets (`***`). Preserve the
 * previously stored raw secrets for those fields so we don't wipe credentials.
 */
export function mergePaymentGatewaySecrets(
  incoming: unknown,
  previous: unknown
): unknown {
  if (!Array.isArray(incoming)) {
    return incoming
  }

  const previousList = Array.isArray(previous) ? previous : []

  return incoming.map((entry) => {
    if (!isObject(entry)) {
      return entry
    }

    const credentials = asObject(entry.credentials)
    if (!credentials) {
      return entry
    }

    const metadata = asObject(entry.metadata)
    const clientId =
      typeof metadata?.client_id === "string" ? metadata.client_id : undefined
    const keyId =
      typeof credentials.key_id === "string" ? credentials.key_id : undefined

    const previousMatch = previousList.find((prev) => {
      if (!isObject(prev)) return false
      const prevMeta = asObject(prev.metadata)
      const prevCreds = asObject(prev.credentials)
      if (
        clientId &&
        typeof prevMeta?.client_id === "string" &&
        prevMeta.client_id === clientId
      ) {
        return true
      }
      return (
        !!keyId &&
        typeof prevCreds?.key_id === "string" &&
        prevCreds.key_id === keyId &&
        prev.gateway === entry.gateway
      )
    })

    const previousCredentials = isObject(previousMatch)
      ? asObject(previousMatch.credentials)
      : undefined

    const nextCredentials: Record<string, unknown> = { ...credentials }

    if (isMaskedSecret(credentials.key_secret) && previousCredentials) {
      nextCredentials.key_secret = previousCredentials.key_secret
    }
    if (isMaskedSecret(credentials.webhook_secret) && previousCredentials) {
      nextCredentials.webhook_secret = previousCredentials.webhook_secret
    }

    return {
      ...entry,
      credentials: nextCredentials,
    }
  })
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined
}

/** Mask credentials on every draft in a list before returning. */
export function maskDrafts<T extends { draft_data?: unknown }>(drafts: T[]): T[] {
  return drafts.map((d) => ({ ...d, draft_data: maskDraftData(d.draft_data) }))
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
