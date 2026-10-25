import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@mercurjs/types"

import { updateIntegrationLocationMappingWorkflow } from "../../../../../../workflows/integration"
import {
  assertLocationsCapability,
  resolveIntegrationService,
  toLocationDTO,
} from "../../../helpers"
import { VendorUpdateIntegrationLocationType } from "../../../validators"

// POST /vendor/integrations/:provider_id/locations/:location_id — map the
// external location to a branch (`stock_location_id`), or unmap it (`null`).
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateIntegrationLocationType>,
  res: MedusaResponse<HttpTypes.VendorIntegrationLocationResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const providerId = req.params.provider_id

  assertLocationsCapability(resolveIntegrationService(req.scope), providerId)

  const { result } = await updateIntegrationLocationMappingWorkflow(req.scope).run({
    input: {
      seller_id: sellerId,
      provider_id: providerId,
      location_id: req.params.location_id,
      stock_location_id: req.validatedBody.stock_location_id,
    },
  })

  res.json({ location: await toLocationDTO(req.scope, result) })
}
