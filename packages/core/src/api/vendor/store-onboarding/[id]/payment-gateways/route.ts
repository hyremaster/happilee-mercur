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
  prepareRazorpayGatewayForSave,
  validateGatewayCredentials,
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

  // Reject unusable credentials up front (Razorpay: verify key auth works).
  await validateGatewayCredentials(gateway, credentials)

  // Razorpay: ensure a webhook_secret and register our webhook on the seller's
  // account so payment events reach the marketplace. Returns credentials with
  // the secret + metadata carrying the razorpay webhook id/url.
  // Reuses the webhook secret of other stores on the same Razorpay account.
  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  const prepared = await prepareRazorpayGatewayForSave(
    service,
    gateway,
    credentials
  )

  // Single-active invariant: deactivate siblings before activating this one.
  if (is_active) {
    await deactivateSiblingGateways(service, sellerId, gateway)
  }

  const mergedMetadata =
    Object.keys(prepared.metadata).length > 0
      ? { ...(metadata ?? {}), ...prepared.metadata }
      : metadata ?? null

  const created = await service.createStorePaymentGateways({
    seller_id: sellerId,
    gateway,
    label,
    is_active: is_active ?? false,
    credentials: prepared.credentials as typeof credentials,
    metadata: mergedMetadata,
  })

  res.status(201).json({ payment_gateway: maskGateway(created) })
}
