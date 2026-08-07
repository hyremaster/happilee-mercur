import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { MedusaError } from "@medusajs/framework/utils"
import { MercurModules, StorePaymentGatewayDTO } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../../modules/marketplace-profile/service"
import { VendorUpdatePaymentGatewayType } from "../../../validators"
import {
  assertStoreOwnership,
  deactivateSiblingGateways,
  isMaskedSecret,
  maskGateway,
  validateGatewayCredentials,
} from "../../../helpers"

// Load the gateway row and verify it belongs to the target store.
async function assertGatewayInStore(
  service: MarketplaceProfileModuleService,
  sellerId: string,
  gatewayId: string
): Promise<StorePaymentGatewayDTO> {
  let gateway: StorePaymentGatewayDTO | undefined
  try {
    gateway = (await service.retrieveStorePaymentGateway(
      gatewayId
    )) as StorePaymentGatewayDTO
  } catch {
    gateway = undefined
  }
  if (!gateway || gateway.seller_id !== sellerId) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Payment gateway not found."
    )
  }
  return gateway
}

// POST /vendor/store-onboarding/:id/payment-gateways/:gateway_id — update one.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdatePaymentGatewayType>,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  const gatewayId = req.params.gateway_id
  await assertStoreOwnership(req, sellerId)

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  const existing = await assertGatewayInStore(service, sellerId, gatewayId)
  const { label, is_active, credentials, metadata } = req.validatedBody

  // Validate new (unmasked) credentials against the provider before saving.
  // Masked round-trips are a no-op inside the helper.
  await validateGatewayCredentials(existing.gateway, credentials)

  // Single-active invariant: deactivate siblings before activating this one.
  if (is_active === true) {
    await deactivateSiblingGateways(
      service,
      sellerId,
      existing.gateway,
      gatewayId
    )
  }

  // Credentials whose secret is masked (the client is echoing a masked read
  // back) are treated as "unchanged" and skipped, so the stored raw secret is
  // never clobbered with the mask.
  const credentialsMasked = isMaskedSecret(credentials?.key_secret)

  const updated = await service.updateStorePaymentGateways({
    id: gatewayId,
    ...(label !== undefined ? { label } : {}),
    ...(is_active !== undefined ? { is_active } : {}),
    ...(credentials !== undefined && !credentialsMasked ? { credentials } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  })

  res.json({ payment_gateway: maskGateway(updated) })
}

// DELETE /vendor/store-onboarding/:id/payment-gateways/:gateway_id — remove one.
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  const gatewayId = req.params.gateway_id
  await assertStoreOwnership(req, sellerId)

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  await assertGatewayInStore(service, sellerId, gatewayId)
  await service.deleteStorePaymentGateways(gatewayId)

  res.json({ id: gatewayId, object: "payment_gateway", deleted: true })
}
