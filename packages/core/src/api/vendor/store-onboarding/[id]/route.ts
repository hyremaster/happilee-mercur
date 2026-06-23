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
import { VendorUpdateStoreType } from "../validators"
import { assertStoreOwnership } from "../helpers"

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

  res.json({
    store: {
      ...seller,
      store_profile: store_profile ?? null,
      owner_handle: ownerProfile?.handle ?? null,
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

  const [store_profile] = await service.listStoreProfiles(
    { seller_id: sellerId },
    { relations: ["order_statuses", "payment_config"] }
  )

  res.json({ store: { id: sellerId, store_profile: store_profile ?? null } })
}
