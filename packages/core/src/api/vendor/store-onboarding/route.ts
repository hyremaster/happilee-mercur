import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MercurModules, SellerStatus } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"
import { createStoreWorkflow } from "../../../workflows/marketplace-profile"
import { VendorCreateStoreType } from "./validators"

// GET /vendor/store-onboarding — list the authenticated owner's stores.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const memberId = req.auth_context?.actor_id

  if (!memberId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You must be authenticated to list stores."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const { data: sellerMembers, metadata } = await query.graph({
    entity: "seller_member",
    fields: req.queryConfig.fields,
    filters: {
      member_id: memberId,
      is_owner: true,
      seller: { status: { $ne: SellerStatus.TERMINATED } },
    },
    pagination: req.queryConfig.pagination,
  })

  const sellerIds = sellerMembers
    .map((sm) => sm.seller_id)
    .filter((id): id is string => !!id)

  const profiles = sellerIds.length
    ? await service.listStoreProfiles({ seller_id: sellerIds })
    : []
  const profileBySeller = new Map(profiles.map((p) => [p.seller_id, p]))

  const [ownerProfile] = await service.listMemberProfiles({
    member_id: memberId,
  })

  const stores = sellerMembers.map((sm) => ({
    ...sm.seller,
    store_profile: profileBySeller.get(sm.seller_id) ?? null,
    owner_handle: ownerProfile?.handle ?? null,
  }))

  res.json({
    stores,
    count: metadata?.count ?? 0,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? 0,
  })
}

// POST /vendor/store-onboarding — create a store (wizard).
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateStoreType>,
  res: MedusaResponse
) => {
  const {
    name,
    handle,
    email,
    phone,
    description,
    currency_code,
    member_email,
    first_name,
    last_name,
    owner_handle,
    industry,
    address,
    professional_details,
    commerce_type,
    fulfillment_methods,
    storefront_template,
    metadata,
  } = req.validatedBody

  const { result } = await createStoreWorkflow(req.scope).run({
    input: {
      auth_identity_id: req.auth_context.auth_identity_id,
      member_id: req.auth_context.actor_id || undefined,
      member_email,
      first_name: first_name ?? undefined,
      last_name: last_name ?? undefined,
      seller: { name, handle, email, phone, description, currency_code },
      address,
      professional_details,
      owner_handle,
      store_profile: {
        industry,
        commerce_type,
        fulfillment_methods,
        storefront_template,
        metadata,
      },
    },
  })

  const { seller } = result as { seller: { id: string } }

  // Set the owner @handle (member_profile). The owner member may have been
  // created inside the workflow, so resolve it from the seller ownership link
  // when the request had no member yet.
  if (owner_handle) {
    let memberId = req.auth_context.actor_id
    if (!memberId) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: sellerMembers } = await query.graph({
        entity: "seller_member",
        fields: ["member_id"],
        filters: { seller_id: seller.id, is_owner: true },
      })
      memberId = sellerMembers[0]?.member_id ?? null
    }

    if (memberId) {
      const service = req.scope.resolve<MarketplaceProfileModuleService>(
        MercurModules.MARKETPLACE_PROFILE
      )
      const [existing] = await service.listMemberProfiles({
        member_id: memberId,
      })
      if (existing) {
        await service.updateMemberProfiles({
          id: existing.id,
          handle: owner_handle,
        })
      } else {
        await service.createMemberProfiles({
          member_id: memberId,
          handle: owner_handle,
        })
      }
    }
  }

  res.status(201).json({ store: result })
}
