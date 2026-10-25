import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { HttpTypes, IntegrationSyncTrigger } from "@mercurjs/types"

import { syncIntegrationLocationsWorkflow } from "../../../../../workflows/integration"
import {
  assertLocationsCapability,
  listLocationDTOs,
  resolveIntegrationService,
} from "../../helpers"
import { VendorRunIntegrationSyncType } from "../../validators"

// POST /vendor/integrations/:provider_id/sync { stream } — run a sync stream
// now. Only `locations` exists today. Runs inline (one read-only provider
// call) and returns the run; a provider/API failure is reported on the run,
// not as an HTTP error.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorRunIntegrationSyncType>,
  res: MedusaResponse<HttpTypes.VendorIntegrationLocationSyncResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const providerId = req.params.provider_id

  assertLocationsCapability(resolveIntegrationService(req.scope), providerId)

  const { result } = await syncIntegrationLocationsWorkflow(req.scope).run({
    input: {
      seller_id: sellerId,
      provider_id: providerId,
      trigger: IntegrationSyncTrigger.MANUAL,
    },
  })

  if (result.already_running || !result.run) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "A locations sync is already running for this store. Try again shortly."
    )
  }

  const locations = await listLocationDTOs(req.scope, sellerId, providerId)
  res.json({ run: result.run, locations })
}
