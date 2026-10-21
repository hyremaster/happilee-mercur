import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes, MercurModules } from "@mercurjs/types"

import type IntegrationModuleService from "../../../../../modules/integration/service"
import { testStoreIntegrationWorkflow } from "../../../../../workflows/integration"
import { VendorTestIntegrationType } from "../../validators"

// POST /vendor/integrations/:provider_id/test — check credentials against the
// provider (read-only) without saving them. Values are merged over the stored
// connection (masked secrets keep their stored value). When nothing differs
// from what is saved, the result is also recorded as the connection status.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorTestIntegrationType>,
  res: MedusaResponse<HttpTypes.VendorIntegrationTestResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const providerId = req.params.provider_id
  const { credentials, settings } = req.validatedBody

  const service = req.scope.resolve<IntegrationModuleService>(
    MercurModules.INTEGRATION
  )

  const existing = await service.retrieveSellerIntegration(sellerId, providerId)

  // Re-testing a saved connection whose credentials can't be decrypted (key
  // changed): report it as a failed test instead of a validation error.
  if (
    existing &&
    !credentials &&
    !service.readStoredCredentials(existing).readable
  ) {
    const { result } = await testStoreIntegrationWorkflow(req.scope).run({
      input: { id: existing.id },
    })
    return res.json({ test_result: result })
  }

  const prepared = await service.prepareStoreIntegration(
    { seller_id: sellerId, provider_id: providerId, credentials, settings },
    existing
  )

  const unchanged =
    !!existing &&
    !prepared.credentials_changed &&
    JSON.stringify(prepared.settings) === JSON.stringify(existing.settings ?? {})

  if (unchanged) {
    const { result } = await testStoreIntegrationWorkflow(req.scope).run({
      input: { id: existing.id },
    })
    return res.json({ test_result: result })
  }

  const testResult = await service.testIntegrationConnection(
    providerId,
    prepared.plain
  )

  res.json({ test_result: testResult })
}
