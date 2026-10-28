import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  HttpTypes,
  IntegrationCapability,
  IntegrationSyncRunDTO,
  IntegrationSyncStream,
} from "@mercurjs/types"

import { assertCapability, latestSyncRun, resolveIntegrationService } from "../../../helpers"

const STREAMS = [
  IntegrationSyncStream.ITEMS,
  IntegrationSyncStream.PRICES,
  IntegrationSyncStream.STOCK,
]

// GET /vendor/integrations/:provider_id/catalog/summary — counts over this
// store's staged catalogue (items, statuses, category values, multi-MRP lots)
// and the latest run of each catalogue stream.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorIntegrationCatalogSummaryResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const providerId = req.params.provider_id
  const service = resolveIntegrationService(req.scope)

  assertCapability(service, providerId, IntegrationCapability.CATALOG, "a catalogue")

  const counts = await service.summarizeExternalCatalog({
    seller_id: sellerId,
    provider_id: providerId,
  })

  const lastRuns: Partial<Record<IntegrationSyncStream, IntegrationSyncRunDTO | null>> = {}
  for (const stream of STREAMS) {
    lastRuns[stream] = await latestSyncRun(req.scope, sellerId, providerId, stream)
  }

  res.json({ summary: { ...counts, last_runs: lastRuns } })
}
