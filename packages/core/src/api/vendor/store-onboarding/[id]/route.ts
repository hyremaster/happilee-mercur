import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../modules/marketplace-profile/service"
import {
  updateSellersWorkflow,
  updateSellerAddressWorkflow,
  updateSellerProfessionalDetailsWorkflow,
} from "../../../../workflows/seller"
import { VendorUpdateStoreType } from "../validators"
import {
  assertStoreOwnership,
  maskGateway,
  sanitizeStoreProfile,
} from "../helpers"

// GET /vendor/store-onboarding/:id — store detail (seller + extension data).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  const memberId = await assertStoreOwnership(req, sellerId)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: req.queryConfig.fields,
    filters: { id: sellerId },
  })

  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Store not found.")
  }

  const [store_profile] = await service.listStoreProfiles(
    { seller_id: sellerId },
    { relations: ["order_statuses", "payment_config"] }
  )
  const [ownerProfile] = await service.listMemberProfiles({
    member_id: memberId,
  })
  const delivery_areas = await service.listStoreDeliveryAreas({
    seller_id: sellerId,
  })
  const gateways = await service.listStorePaymentGateways({
    seller_id: sellerId,
  })

  res.json({
    store: {
      ...seller,
      store_profile: sanitizeStoreProfile(store_profile),
      owner_handle: ownerProfile?.handle ?? null,
      delivery_areas,
      payment_gateways: gateways.map(maskGateway),
    },
  })
}

// POST /vendor/store-onboarding/:id — update store extension data (steps 2-4).
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateStoreType>,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  const memberId = await assertStoreOwnership(req, sellerId)
  const body = req.validatedBody

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  // Step 1 — business details on seller-native tables.
  // Seller core fields (name/email/phone/description).
  const sellerUpdate: Record<string, unknown> = {}
  if (body.name !== undefined) sellerUpdate.name = body.name
  if (body.email !== undefined) sellerUpdate.email = body.email
  if (body.phone !== undefined) sellerUpdate.phone = body.phone
  if (body.description !== undefined) sellerUpdate.description = body.description
  if (Object.keys(sellerUpdate).length) {
    await updateSellersWorkflow(req.scope).run({
      input: { selector: { id: sellerId }, update: sellerUpdate },
    })
  }

  // Address (upsert) — country/state/city/pincode + address line.
  if (body.address) {
    await updateSellerAddressWorkflow(req.scope).run({
      input: { seller_id: sellerId, data: body.address },
    })
  }

  // Professional details (upsert) — legal name + tax/GST.
  if (body.professional_details) {
    await updateSellerProfessionalDetailsWorkflow(req.scope).run({
      input: { seller_id: sellerId, data: body.professional_details },
    })
  }

  let [profile] = await service.listStoreProfiles({ seller_id: sellerId })
  if (!profile) {
    profile = await service.createStoreProfiles({ seller_id: sellerId })
  }

  await service.updateStoreProfiles({
    id: profile.id,
    ...(body.industry !== undefined ? { industry: body.industry } : {}),
    ...(body.commerce_type !== undefined
      ? { commerce_type: body.commerce_type }
      : {}),
    ...(body.fulfillment_methods !== undefined
      ? { fulfillment_methods: body.fulfillment_methods }
      : {}),
    ...(body.storefront_template !== undefined
      ? { storefront_template: body.storefront_template }
      : {}),
    ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
  })

  // Payment config (upsert, 1:1).
  if (body.payment_config) {
    const [existing] = await service.listStorePaymentConfigs({
      store_profile_id: profile.id,
    })
    if (existing) {
      await service.updateStorePaymentConfigs({
        id: existing.id,
        ...body.payment_config,
      })
    } else {
      await service.createStorePaymentConfigs({
        store_profile_id: profile.id,
        ...body.payment_config,
      })
    }
  }

  // Payment gateway (upsert by seller_id + gateway). Credentials stored raw;
  // masked on read.
  if (body.payment_gateway) {
    const { gateway, is_active, credentials, metadata } = body.payment_gateway
    const [existing] = await service.listStorePaymentGateways({
      seller_id: sellerId,
      gateway,
    })
    if (existing) {
      await service.updateStorePaymentGateways({
        id: existing.id,
        is_active: is_active ?? existing.is_active,
        credentials,
        ...(metadata !== undefined ? { metadata } : {}),
      })
    } else {
      await service.createStorePaymentGateways({
        seller_id: sellerId,
        gateway,
        is_active: is_active ?? false,
        credentials,
        metadata: metadata ?? null,
      })
    }
  }

  // Order statuses (full replace, e.g. "Reset to defaults" or reorder/rename).
  if (body.order_statuses) {
    const existing = await service.listStoreOrderStatuses({
      store_profile_id: profile.id,
    })
    if (existing.length) {
      await service.deleteStoreOrderStatuses(existing.map((e) => e.id))
    }
    await service.createStoreOrderStatuses(
      body.order_statuses.map((s) => ({ ...s, store_profile_id: profile.id }))
    )
  }

  // Owner @handle (member_profile, upsert).
  if (body.owner_handle) {
    const [ownerProfile] = await service.listMemberProfiles({
      member_id: memberId,
    })
    if (ownerProfile) {
      await service.updateMemberProfiles({
        id: ownerProfile.id,
        handle: body.owner_handle,
      })
    } else {
      await service.createMemberProfiles({
        member_id: memberId,
        handle: body.owner_handle,
      })
    }
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: req.queryConfig.fields,
    filters: { id: sellerId },
  })

  const [store_profile] = await service.listStoreProfiles(
    { seller_id: sellerId },
    { relations: ["order_statuses", "payment_config"] }
  )
  const [ownerProfile] = await service.listMemberProfiles({
    member_id: memberId,
  })
  const delivery_areas = await service.listStoreDeliveryAreas({
    seller_id: sellerId,
  })
  const gateways = await service.listStorePaymentGateways({
    seller_id: sellerId,
  })

  res.json({
    store: {
      ...seller,
      store_profile: sanitizeStoreProfile(store_profile),
      owner_handle: ownerProfile?.handle ?? null,
      delivery_areas,
      payment_gateways: gateways.map(maskGateway),
    },
  })
}
