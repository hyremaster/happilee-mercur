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
// The `x-api-key` used against the Happilee API is resolved in priority order:
//   1. the SSO-bound HappileeIdentityKey for this auth identity — the key of the
//      project whose SSO authorized the CURRENT login session (overwritten on
//      each SSO, so it always reflects the current project)
//   2. the authenticated member's store_profile.happilee_api_key (fallback for a
//      session with no SSO-bound key, e.g. a store created before this mechanism)
//   3. the AREASENSE_API_KEY env var (dev/bootstrap fallback, in the client)
//
// Identity key MUST come first: a member can belong to several sellers (one per
// Happilee project they've entered), so scanning store_profiles would return an
// arbitrary/earlier project's key and leak the wrong project's areas.
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

// Resolve the Happilee API key for the authenticated vendor. Prefers the SSO-bound
// identity key (the current session's project); falls back to an owned
// store_profile key; returns null when neither exists (client uses env fallback).
async function resolveHappileeApiKey(
  req: AuthenticatedMedusaRequest
): Promise<string | null> {
  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  // 1. Current session's project — SSO-bound key for this auth identity.
  const authIdentityId = req.auth_context?.auth_identity_id
  if (authIdentityId) {
    const [identityKey] = await service.listHappileeIdentityKeys(
      { auth_identity_id: authIdentityId },
      { take: 1 }
    )
    if (identityKey?.happilee_api_key) {
      return identityKey.happilee_api_key
    }
  }

  // 2. Fallback — key on an owned store_profile (no identity key on this session).
  const memberId = req.auth_context?.actor_id
  if (memberId) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: sellerMembers } = await query.graph({
      entity: "seller_member",
      fields: ["seller_id"],
      filters: { member_id: memberId },
    })

    const sellerIds = sellerMembers
      .map((m) => m.seller_id as string | undefined)
      .filter((id): id is string => !!id)

    if (sellerIds.length) {
      const profiles = await service.listStoreProfiles({ seller_id: sellerIds })
      const profileWithKey = profiles.find((p) => !!p.happilee_api_key)
      if (profileWithKey?.happilee_api_key) {
        return profileWithKey.happilee_api_key
      }
    }
  }

  return null
}
