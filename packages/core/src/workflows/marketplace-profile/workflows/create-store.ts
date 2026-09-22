import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  CreateSellerDTO,
  DEFAULT_STORE_ORDER_STATUSES,
  StoreCommerceType,
  StoreFulfillmentMethod,
  StoreIndustry,
  UpdateSellerAddressDTO,
  UpdateProfessionalDetailsDTO,
} from "@mercurjs/types"

import { createSellerAccountWorkflow } from "../../seller"
import {
  createStoreProfileStep,
  createStoreOrderStatusesStep,
} from "../steps"

export const createStoreWorkflowId = "create-store"

type CreateStoreWorkflowInput = {
  auth_identity_id: string
  member_id?: string
  member_email?: string
  first_name?: string
  last_name?: string
  seller: CreateSellerDTO
  address?: UpdateSellerAddressDTO
  professional_details?: UpdateProfessionalDetailsDTO
  owner_handle?: string
  store_profile?: {
    industry?: StoreIndustry | null
    commerce_type?: StoreCommerceType | null
    fulfillment_methods?: StoreFulfillmentMethod[] | null
    storefront_template?: string | null
    happilee_api_key?: string | null
    metadata?: Record<string, unknown> | null
  }
}

export const createStoreWorkflow: ReturnType<typeof createWorkflow> = createWorkflow(
  createStoreWorkflowId,
  function (input: CreateStoreWorkflowInput) {
    // 1. Seller (store) + owner member + ownership link (reuses Mercur).
    const seller = createSellerAccountWorkflow.runAsStep({
      input: transform(input, (i) => ({
        auth_identity_id: i.auth_identity_id,
        member_id: i.member_id,
        member_email: i.member_email,
        first_name: i.first_name,
        last_name: i.last_name,
        seller: i.seller,
        address: i.address,
        professional_details: i.professional_details,
      })),
    })

    // 2. Our store_profile extension (steps 1-4 fields).
    const storeProfile = createStoreProfileStep(
      transform({ seller, input }, ({ seller, input }) => ({
        seller_id: seller.id,
        industry: input.store_profile?.industry ?? null,
        commerce_type: input.store_profile?.commerce_type ?? null,
        fulfillment_methods: input.store_profile?.fulfillment_methods ?? null,
        storefront_template: input.store_profile?.storefront_template ?? null,
        happilee_api_key: input.store_profile?.happilee_api_key ?? null,
        metadata: input.store_profile?.metadata ?? null,
      }))
    )

    // 3. Seed the per-store order statuses from defaults (step 2).
    createStoreOrderStatusesStep(
      transform({ storeProfile }, ({ storeProfile }) =>
        DEFAULT_STORE_ORDER_STATUSES.map((s) => ({
          store_profile_id: storeProfile.id,
          status: s.status,
          display_name: s.display_name,
          color: s.color,
          is_active: s.is_active,
          is_required: s.is_required,
          rank: s.rank,
        }))
      )
    )

    // Owner @handle (member_profile) is upserted by the route after creation,
    // because a first-time creator's member is created inside
    // createSellerAccountWorkflow and its id is only known via the seller link.

    return new WorkflowResponse({ seller, store_profile: storeProfile })
  }
)
