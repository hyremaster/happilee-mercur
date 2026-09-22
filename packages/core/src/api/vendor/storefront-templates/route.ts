import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const marketplaceProfileService: MarketplaceProfileModuleService =
    req.scope.resolve(MercurModules.MARKETPLACE_PROFILE)

  const templates = await marketplaceProfileService.listStorefrontTemplates(
    { is_active: true },
    { order: { rank: "ASC" } }
  )

  res.json({ storefront_templates: templates })
}
