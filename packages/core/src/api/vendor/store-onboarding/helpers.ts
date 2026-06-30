import { AuthenticatedMedusaRequest } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MercurModules, StoreOnboardingDraftDTO } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"

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
