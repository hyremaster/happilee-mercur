import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import { fetchAreaSenseAreas } from "../client"

// GET /vendor/store-onboarding/area-sense/areas — proxy the external Area Sense
// OpenAPI to populate the "Delivery available areas" dropdown (wizard step 2).
//
// The `x-api-key` used against the Happilee API is read from the authenticated
// member's store_profile.happilee_api_key. During onboarding drafts the store
// (seller) does not exist yet, so no key is found and the client falls back to
// the AREASENSE_API_KEY env var.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const search =
    typeof req.query.search === "string" ? req.query.search : undefined

  const apiKey = await resolveHappileeApiKey(req)

  const areas = await fetchAreaSenseAreas({ search }, { apiKey })
  res.json({ areas })
}

// Resolve the Happilee API key for the authenticated member's store. Returns the
// first owned store_profile that has a key set, or null when none exists (draft).
async function resolveHappileeApiKey(
  req: AuthenticatedMedusaRequest
): Promise<string | null> {
  const memberId = req.auth_context?.actor_id
  if (!memberId) {
    return null
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sellerMembers } = await query.graph({
    entity: "seller_member",
    fields: ["seller_id"],
    filters: { member_id: memberId },
  })

  const sellerIds = sellerMembers
    .map((m) => m.seller_id as string | undefined)
    .filter((id): id is string => !!id)

  if (!sellerIds.length) {
    return null
  }

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  const profiles = await service.listStoreProfiles({ seller_id: sellerIds })

  const profileWithKey = profiles.find((p) => !!p.happilee_api_key)
  return profileWithKey?.happilee_api_key ?? null
}
