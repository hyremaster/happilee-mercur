import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { MedusaError } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../../modules/marketplace-profile/service"
import { assertStoreOwnership } from "../../../helpers"

// DELETE /vendor/store-onboarding/:id/delivery-areas/:area_sense_id — remove one
// saved delivery area from a store.
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  const areaSenseId = req.params.area_sense_id
  await assertStoreOwnership(req, sellerId)

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const [existing] = await service.listStoreDeliveryAreas({
    seller_id: sellerId,
    area_sense_id: areaSenseId,
  })

  if (!existing) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Delivery area not found for this store."
    )
  }

  await service.deleteStoreDeliveryAreas(existing.id)

  res.json({ id: areaSenseId, object: "delivery_area", deleted: true })
}
