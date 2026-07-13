import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import { VendorCreatePaymentGatewayType } from "../../validators"
import {
  assertStoreOwnership,
  deactivateSiblingGateways,
  maskGateway,
} from "../../helpers"

// GET /vendor/store-onboarding/:id/payment-gateways — list a store's payment
// gateway accounts (credentials masked).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  await assertStoreOwnership(req, sellerId)

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const gateways = await service.listStorePaymentGateways({
    seller_id: sellerId,
  })

  res.json({ payment_gateways: gateways.map(maskGateway) })
}

// POST /vendor/store-onboarding/:id/payment-gateways — add one account.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreatePaymentGatewayType>,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  await assertStoreOwnership(req, sellerId)
  const { gateway, label, is_active, credentials, metadata } = req.validatedBody

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  // Single-active invariant: deactivate siblings before activating this one.
  if (is_active) {
    await deactivateSiblingGateways(service, sellerId, gateway)
  }

  const created = await service.createStorePaymentGateways({
    seller_id: sellerId,
    gateway,
    label,
    is_active: is_active ?? false,
    credentials,
    metadata: metadata ?? null,
  })

  res.status(201).json({ payment_gateway: maskGateway(created) })
}
