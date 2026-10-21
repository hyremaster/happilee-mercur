import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes, MercurModules } from "@mercurjs/types"

import type IntegrationModuleService from "../../../modules/integration/service"

// GET /vendor/integrations — every configured provider with the active
// store's connection (secrets masked), or `connection: null`.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorIntegrationListResponse>
) => {
  const service = req.scope.resolve<IntegrationModuleService>(
    MercurModules.INTEGRATION
  )

  const integrations = await service.listSellerIntegrations(
    req.seller_context!.seller_id
  )

  res.json({ integrations })
}
