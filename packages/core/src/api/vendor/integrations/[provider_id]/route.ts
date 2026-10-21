import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes, IntegrationTestResult, MercurModules } from "@mercurjs/types"

import type IntegrationModuleService from "../../../../modules/integration/service"
import {
  deleteStoreIntegrationWorkflow,
  testStoreIntegrationWorkflow,
  upsertStoreIntegrationWorkflow,
} from "../../../../workflows/integration"
import { VendorSaveIntegrationType } from "../validators"

// GET /vendor/integrations/:provider_id — one provider + this store's
// connection (secrets masked).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorIntegrationResponse>
) => {
  const service = req.scope.resolve<IntegrationModuleService>(
    MercurModules.INTEGRATION
  )

  const integration = await service.retrieveSellerIntegrationItem(
    req.seller_context!.seller_id,
    req.params.provider_id
  )

  res.json({ integration })
}

// POST /vendor/integrations/:provider_id — create or update the store's
// connection. Secret values sent back masked (`••••…`) keep the stored value.
// Unless `test: false`, the saved connection is tested and its status
// recorded; a failed test does not undo the save.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorSaveIntegrationType>,
  res: MedusaResponse<HttpTypes.VendorIntegrationSaveResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const providerId = req.params.provider_id
  const { label, is_enabled, credentials, settings, test } = req.validatedBody

  const service = req.scope.resolve<IntegrationModuleService>(
    MercurModules.INTEGRATION
  )

  // Validate + encrypt here so plaintext secrets never enter workflow state.
  const existing = await service.retrieveSellerIntegration(sellerId, providerId)
  const prepared = await service.prepareStoreIntegration(
    {
      seller_id: sellerId,
      provider_id: providerId,
      credentials,
      settings,
    },
    existing
  )

  const { result: saved } = await upsertStoreIntegrationWorkflow(req.scope).run({
    input: {
      seller_id: sellerId,
      provider_id: providerId,
      label,
      is_enabled,
      encrypted_credentials: prepared.credentials,
      settings: prepared.settings,
      credentials_changed: prepared.credentials_changed,
      actor_id: req.auth_context.actor_id,
    },
  })

  let testResult: IntegrationTestResult | null = null
  if (test !== false) {
    const { result } = await testStoreIntegrationWorkflow(req.scope).run({
      input: { id: saved.id },
    })
    testResult = result
  }

  const integration = await service.retrieveSellerIntegrationItem(
    sellerId,
    providerId
  )

  res.json({ integration, test_result: testResult })
}

// DELETE /vendor/integrations/:provider_id — disconnect and wipe credentials.
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorIntegrationDeleteResponse>
) => {
  const { result } = await deleteStoreIntegrationWorkflow(req.scope).run({
    input: {
      seller_id: req.seller_context!.seller_id,
      provider_id: req.params.provider_id,
    },
  })

  res.json({ id: result.id, object: "store_integration", deleted: true })
}
