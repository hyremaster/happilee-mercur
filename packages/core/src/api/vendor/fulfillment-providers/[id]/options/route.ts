import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { IFulfillmentModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

// GET /vendor/fulfillment-providers/:id/options
// Lists the fulfillment options a provider exposes (used by the vendor
// shipping-option create/edit form). Mirrors the admin route.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const fulfillmentModule = req.scope.resolve<IFulfillmentModuleService>(
    Modules.FULFILLMENT
  )

  const fulfillmentOptions = await fulfillmentModule.retrieveFulfillmentOptions(
    req.params.id
  )

  res.json({
    fulfillment_options: fulfillmentOptions,
    count: fulfillmentOptions.length,
    limit: fulfillmentOptions.length,
    offset: 0,
  })
}
