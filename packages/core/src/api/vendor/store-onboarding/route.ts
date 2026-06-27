import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  MercurModules,
  SellerStatus,
  StoreOnboardingDraftStatus,
} from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"
import { createStoreWorkflow } from "../../../workflows/marketplace-profile"
import { VendorCreateStoreType } from "./validators"

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}

const asString = (v: unknown): string | null =>
  typeof v === "string" ? v : null

// GET /vendor/store-onboarding — unified list of the owner's stores: submitted
// stores (real sellers) PLUS in-progress onboarding drafts, shown as one table.
// A first-time vendor has no Member yet, so the list is keyed by the auth
// identity and works even before any seller exists.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const authIdentityId = req.auth_context?.auth_identity_id
  const memberId = req.auth_context?.actor_id

  if (!authIdentityId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You must be authenticated to list stores."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  // ?status=draft | active (default: both)
  const rawStatus = req.query.status
  const statusFilter = typeof rawStatus === "string" ? rawStatus : null
  const wantStores = statusFilter !== StoreOnboardingDraftStatus.DRAFT
  const wantDrafts = statusFilter !== "active"

  type Row = {
    id: string
    object: "store" | "store_draft"
    is_draft: boolean
    status: string
    name: string | null
    owner_handle: string | null
    industry: string | null
    commerce_type: string | null
    created_at: Date
    updated_at: Date
    // store rows
    handle?: string | null
    store_profile?: unknown
    // draft rows
    draft_id?: string
    onboarding_step?: number
  }

  // 1. Submitted stores (real sellers) — only when the vendor has a Member.
  const storeRows: Row[] = []
  if (wantStores && memberId) {
    const { data: sellerMembers } = await query.graph({
      entity: "seller_member",
      fields: req.queryConfig.fields,
      filters: {
        member_id: memberId,
        is_owner: true,
        seller: { status: { $ne: SellerStatus.TERMINATED } },
      },
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

    for (const sm of sellerMembers) {
      const seller = sm.seller
      const profile = profileBySeller.get(sm.seller_id)
      storeRows.push({
        id: seller.id,
        object: "store",
        is_draft: false,
        status: seller.status,
        name: seller.name ?? null,
        owner_handle: ownerProfile?.handle ?? null,
        industry: profile?.industry ?? null,
        commerce_type: profile?.commerce_type ?? null,
        handle: seller.handle ?? null,
        store_profile: profile ?? null,
        created_at: seller.created_at,
        updated_at: seller.updated_at,
      })
    }
  }

  // 2. In-progress drafts (no seller yet), keyed by the auth identity.
  const draftRows: Row[] = []
  if (wantDrafts) {
    const drafts = await service.listStoreOnboardingDrafts({
      auth_identity_id: authIdentityId,
      status: StoreOnboardingDraftStatus.DRAFT,
    })
    for (const d of drafts) {
      const data = asObject(d.draft_data)
      const business = asObject(data.business)
      const commerce = asObject(data.commerce)
      draftRows.push({
        id: d.id,
        object: "store_draft",
        is_draft: true,
        status: "draft",
        name: asString(business.name),
        owner_handle: asString(business.owner_handle),
        industry: asString(business.industry),
        commerce_type: asString(commerce.commerce_type),
        draft_id: d.id,
        onboarding_step: d.onboarding_step,
        created_at: d.created_at,
        updated_at: d.updated_at,
      })
    }
  }

  // 3. Merge (drafts first), then paginate in the app layer.
  const all = [...draftRows, ...storeRows]
  const skip = req.queryConfig.pagination.skip ?? 0
  const take = req.queryConfig.pagination.take ?? all.length
  const stores = all.slice(skip, skip + take)

  res.json({
    stores,
    count: all.length,
    offset: skip,
    limit: take,
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
