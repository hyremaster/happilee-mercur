import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes, IntegrationSyncStream } from "@mercurjs/types"

import {
  assertLocationsCapability,
  latestSyncRun,
  listLocationDTOs,
  resolveIntegrationService,
} from "../../helpers"

// GET /vendor/integrations/:provider_id/locations — the store's external
// locations (outlets) for a provider with their mapped branches, plus the
// latest locations sync run.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorIntegrationLocationListResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const providerId = req.params.provider_id

  assertLocationsCapability(resolveIntegrationService(req.scope), providerId)

  const [locations, lastRun] = await Promise.all([
    listLocationDTOs(req.scope, sellerId, providerId),
    latestSyncRun(req.scope, sellerId, providerId, IntegrationSyncStream.LOCATIONS),
  ])

  res.json({ locations, last_run: lastRun })
}
