import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import type { IntegrationSyncRunRow } from "../../../../../modules/integration/service"
import { resolveIntegrationService } from "../../helpers"
import {
  VendorListIntegrationSyncRuns,
  VendorListIntegrationSyncRunsType,
} from "../../validators"

// GET /vendor/integrations/:provider_id/sync-runs?stream=&limit= — recent
// sync runs for this store and provider, newest first.
export const GET = async (
  req: AuthenticatedMedusaRequest<VendorListIntegrationSyncRunsType>,
  res: MedusaResponse<HttpTypes.VendorIntegrationSyncRunListResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const providerId = req.params.provider_id
  const service = resolveIntegrationService(req.scope)

  service.retrieveIntegrationProvider(providerId)

  const parsed = VendorListIntegrationSyncRuns.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues.map((issue) => issue.message).join(" ")
    )
  }
  const { stream, limit } = parsed.data
  const rows = (await service.listIntegrationSyncRuns(
    {
      seller_id: sellerId,
      provider_id: providerId,
      ...(stream ? { stream } : {}),
    },
    { order: { started_at: "DESC" }, take: limit ?? 10 }
  )) as IntegrationSyncRunRow[]

  res.json({ sync_runs: rows.map((row) => service.toSyncRunDTO(row)) })
}
