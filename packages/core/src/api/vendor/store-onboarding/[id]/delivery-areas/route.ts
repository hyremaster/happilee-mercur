import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import { VendorSaveDeliveryAreasType } from "../../validators"
import { assertStoreOwnership } from "../../helpers"

// GET /vendor/store-onboarding/:id/delivery-areas — list a store's saved
// Area Sense delivery areas.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  await assertStoreOwnership(req, sellerId)

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const delivery_areas = await service.listStoreDeliveryAreas({
    seller_id: sellerId,
  })

  res.json({ delivery_areas })
}

// POST /vendor/store-onboarding/:id/delivery-areas — replace a store's saved
// delivery areas with the provided selection (full replace).
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorSaveDeliveryAreasType>,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  await assertStoreOwnership(req, sellerId)
  const { areas } = req.validatedBody

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const existing = await service.listStoreDeliveryAreas({ seller_id: sellerId })
  if (existing.length) {
    await service.deleteStoreDeliveryAreas(existing.map((e) => e.id))
  }

  const delivery_areas = areas.length
    ? await service.createStoreDeliveryAreas(
        areas.map((a) => ({ ...a, seller_id: sellerId }))
      )
    : []

  res.json({ delivery_areas })
}
