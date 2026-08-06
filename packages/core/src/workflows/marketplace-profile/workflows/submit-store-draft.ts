import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { CreateStockLocationInput } from "@medusajs/framework/types"
import {
  CreateSellerDTO,
  StoreCommerceType,
  StoreFulfillmentMethod,
  StoreIndustry,
  StoreOrderStatusType,
  StorePaymentGatewayType,
  StorePaymentGatewayCredentials,
  UpdateProfessionalDetailsDTO,
  UpdateSellerAddressDTO,
} from "@mercurjs/types"

import { approveSellerWorkflow } from "../../seller"
import { createSellerStockLocationsWorkflow } from "../../stock-location"
import { createStoreWorkflow } from "./create-store"
import {
  finalizeStoreExtrasStep,
  createStoreLocationDetailsStep,
  createStoreDeliveryAreasStep,
  createStorePaymentGatewaysStep,
  markDraftSubmittedStep,
} from "../steps"

export const submitStoreDraftWorkflowId = "submit-store-draft"

type DraftLocation = {
  name: string
  address?: Record<string, unknown>
  is_active?: boolean
  latitude?: number | null
  longitude?: number | null
}

type SubmitStoreDraftWorkflowInput = {
  draft_id: string
  auth_identity_id: string
  member_id?: string
  member_email?: string
  seller: CreateSellerDTO
  address?: UpdateSellerAddressDTO
  professional_details?: UpdateProfessionalDetailsDTO
  owner_handle?: string
  store_profile: {
    industry?: StoreIndustry | null
    commerce_type?: StoreCommerceType | null
    fulfillment_methods?: StoreFulfillmentMethod[] | null
    storefront_template?: string | null
    happilee_api_key?: string | null
  }
  payment?: {
    online_enabled?: boolean
    payment_provider_id?: string | null
    cod_enabled?: boolean
    cod_min_amount?: number | null
    cod_max_amount?: number | null
    currency_code?: string | null
  } | null
  order_statuses?: {
    status: StoreOrderStatusType
    display_name: string
    color?: string | null
    is_active?: boolean
    is_required?: boolean
    rank?: number
  }[] | null
  locations?: DraftLocation[] | null
  delivery_areas?: {
    area_sense_id: string
    area_name: string
    metadata?: Record<string, unknown> | null
  }[] | null
  payment_gateways?: {
    gateway: StorePaymentGatewayType
    label: string
    is_active?: boolean
    credentials: StorePaymentGatewayCredentials
    metadata?: Record<string, unknown> | null
  }[] | null
}

export const submitStoreDraftWorkflow =
  createWorkflow(
    submitStoreDraftWorkflowId,
    function (input: SubmitStoreDraftWorkflowInput) {
      // 1. Materialize the store (seller + owner link + store_profile + seeded
      //    order statuses) — reuses the M2 create flow.
      const created = createStoreWorkflow.runAsStep({
        input: transform(input, (i) => ({
          auth_identity_id: i.auth_identity_id,
          member_id: i.member_id,
          member_email: i.member_email,
          seller: i.seller,
          address: i.address,
          professional_details: i.professional_details,
          owner_handle: i.owner_handle,
          store_profile: i.store_profile,
        })),
      }) as unknown as {
        seller: { id: string }
        store_profile: { id: string }
      }

      // 1b. Submitting a completed onboarding draft is self-service approval:
      //     the store goes live (status OPEN + approved_at) immediately rather
      //     than sitting in pending_approval. Emits the standard APPROVED event.
      approveSellerWorkflow.runAsStep({
        input: transform(created, (c) => ({ seller_id: c.seller.id })),
      })

      // 2. Payment config + optional order-status overrides.
      finalizeStoreExtrasStep(
        transform({ created, input }, ({ created, input }) => ({
          store_profile_id: created.store_profile.id,
          payment: input.payment ?? null,
          order_statuses: input.order_statuses ?? null,
        }))
      )

      // 3. Locations: create all StockLocations (+ seller link) in one call,
      //    then their store_location_detail rows (is_active + map pin).
      const createdLocations = when(
        input,
        (i) => !!i.locations && i.locations.length > 0
      ).then(() =>
        createSellerStockLocationsWorkflow.runAsStep({
          input: transform({ created, input }, ({ created, input }) => ({
            seller_id: created.seller.id,
            locations: (input.locations ?? []).map((l) => ({
              name: l.name,
              address: l.address,
            })) as unknown as CreateStockLocationInput[],
          })),
        })
      )

      createStoreLocationDetailsStep(
        transform(
          { createdLocations, input },
          ({ createdLocations, input }) => {
            const locs = (createdLocations ?? []) as { id: string }[]
            const drafts = input.locations ?? []
            return locs.map((loc, i) => ({
              stock_location_id: loc.id,
              is_active: drafts[i]?.is_active ?? true,
              latitude: drafts[i]?.latitude ?? null,
              longitude: drafts[i]?.longitude ?? null,
            }))
          }
        )
      )

      // 3b. Delivery areas (Area Sense selections) — seller-scoped, so they
      //     materialize once the seller exists.
      createStoreDeliveryAreasStep(
        transform({ created, input }, ({ created, input }) =>
          (input.delivery_areas ?? []).map((a) => ({
            seller_id: created.seller.id,
            area_sense_id: a.area_sense_id,
            area_name: a.area_name,
            metadata: a.metadata ?? null,
          }))
        )
      )

      // 3c. Payment gateways (credentials, many-of-same-type) — seller-scoped,
      //     created after the seller exists.
      createStorePaymentGatewaysStep(
        transform({ created, input }, ({ created, input }) =>
          (input.payment_gateways ?? []).map((g) => ({
            seller_id: created.seller.id,
            gateway: g.gateway,
            label: g.label,
            is_active: g.is_active,
            credentials: g.credentials,
            metadata: g.metadata ?? null,
          }))
        )
      )

      // 4. Flip the draft to submitted, linking the created store.
      markDraftSubmittedStep(
        transform({ created, input }, ({ created, input }) => ({
          draft_id: input.draft_id,
          seller_id: created.seller.id,
        }))
      )

      return new WorkflowResponse({
        seller: created.seller,
        store_profile: created.store_profile,
        draft_id: input.draft_id,
      })
    }
  )
