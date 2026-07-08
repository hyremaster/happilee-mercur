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
  StoreCommerceType,
  StoreFulfillmentMethod,
  StoreIndustry,
  StoreOnboardingDraftStatus,
  StoreOrderStatusType,
  StorePaymentGatewayType,
  StorePaymentGatewayCredentials,
} from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../../modules/marketplace-profile/service"
import { submitStoreDraftWorkflow } from "../../../../../../workflows/marketplace-profile"
import { assertDraftOwnership, sanitizeStoreProfile } from "../../../helpers"

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}

const asString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined

// POST /vendor/store-onboarding/drafts/:draft_id/submit — materialize the store.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const draft = await assertDraftOwnership(req, req.params.draft_id)

  if (draft.status === StoreOnboardingDraftStatus.SUBMITTED) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This draft has already been submitted."
    )
  }

  const data = asObject(draft.draft_data)
  const business = asObject(data.business)
  const commerce = asObject(data.commerce)
  const fulfillment = asObject(data.fulfillment)
  const storefront = asObject(data.storefront)

  const name = asString(business.name)
  const email = asString(business.email)
  if (!name || !email) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Business details (name, email) are required before submitting."
    )
  }

  const handle = asString(storefront.handle) ?? asString(business.handle)
  const ownerHandle =
    asString(business.owner_handle) ?? asString(storefront.owner_handle)
  // Figma step 1 has no currency field; default until it is finalized.
  const currencyCode = asString(business.currency_code) ?? "inr"

  const payment = data.payment
    ? asObject(data.payment)
    : asObject(fulfillment.payment)

  // Payment gateways (credentials, many-of-same-type) — step 3, under
  // fulfillment.payment_gateways. Legacy singular `payment_gateway` (either
  // top-level or under fulfillment) is folded into the array.
  const gatewaySources: unknown[] = Array.isArray(fulfillment.payment_gateways)
    ? (fulfillment.payment_gateways as unknown[])
    : Array.isArray(data.payment_gateways)
      ? (data.payment_gateways as unknown[])
      : [data.payment_gateway ?? fulfillment.payment_gateway]

  const paymentGateways = gatewaySources
    .map((raw) => {
      const gatewayRaw = asObject(raw)
      const gatewayCreds = asObject(gatewayRaw.credentials)
      if (!asString(gatewayRaw.gateway) || !asString(gatewayCreds.key_id)) {
        return null
      }
      return {
        gateway: gatewayRaw.gateway as StorePaymentGatewayType,
        label: asString(gatewayRaw.label) ?? "default",
        is_active:
          typeof gatewayRaw.is_active === "boolean"
            ? gatewayRaw.is_active
            : true,
        credentials: {
          key_id: String(gatewayCreds.key_id),
          key_secret: asString(gatewayCreds.key_secret) ?? "",
          ...(asString(gatewayCreds.webhook_secret)
            ? { webhook_secret: String(gatewayCreds.webhook_secret) }
            : {}),
        } as StorePaymentGatewayCredentials,
        metadata:
          (gatewayRaw.metadata as Record<string, unknown> | undefined) ?? null,
      }
    })
    .filter(
      (g): g is NonNullable<typeof g> => g !== null
    )
  const locations = Array.isArray(fulfillment.locations)
    ? (fulfillment.locations as Record<string, unknown>[])
    : Array.isArray(data.locations)
      ? (data.locations as Record<string, unknown>[])
      : []

  const { result } = await submitStoreDraftWorkflow(req.scope).run({
    input: {
      draft_id: draft.id,
      auth_identity_id: req.auth_context.auth_identity_id,
      member_id: req.auth_context.actor_id || undefined,
      member_email: email,
      seller: {
        name,
        email,
        currency_code: currencyCode,
        handle,
        phone: asString(business.phone) ?? null,
        description: asString(business.description) ?? null,
      },
      address: business.address as Record<string, unknown> | undefined,
      professional_details: business.professional_details as
        | Record<string, unknown>
        | undefined,
      owner_handle: ownerHandle,
      store_profile: {
        industry: (business.industry as StoreIndustry | undefined) ?? null,
        commerce_type:
          (commerce.commerce_type as StoreCommerceType | undefined) ?? null,
        fulfillment_methods:
          (commerce.fulfillment_methods as StoreFulfillmentMethod[] | undefined) ??
          null,
        storefront_template:
          (storefront.storefront_template as string | undefined) ?? null,
        // Secret seeded server-side from the SSO token (dedicated draft column,
        // not draft_data) — carried into store_profile on submit.
        happilee_api_key: draft.happilee_api_key ?? null,
      },
      payment: Object.keys(payment).length
        ? (payment as {
            online_enabled?: boolean
            payment_provider_id?: string | null
            cod_enabled?: boolean
            cod_min_amount?: number | null
            cod_max_amount?: number | null
            currency_code?: string | null
          })
        : null,
      order_statuses: Array.isArray(commerce.order_statuses)
        ? (commerce.order_statuses as {
            status: StoreOrderStatusType
            display_name: string
            color?: string | null
            is_active?: boolean
            is_required?: boolean
            rank?: number
          }[])
        : null,
      locations: locations.map((l) => ({
        name: asString(l.name) ?? "",
        address: asObject(l.address),
        is_active: typeof l.is_active === "boolean" ? l.is_active : true,
        latitude: typeof l.latitude === "number" ? l.latitude : null,
        longitude: typeof l.longitude === "number" ? l.longitude : null,
      })),
      delivery_areas: Array.isArray(commerce.delivery_areas)
        ? (commerce.delivery_areas as Record<string, unknown>[])
            .map((a) => ({
              area_sense_id: asString(a.area_sense_id) ?? "",
              area_name: asString(a.area_name) ?? "",
              metadata:
                (a.metadata as Record<string, unknown> | undefined) ?? null,
            }))
            .filter((a) => a.area_sense_id && a.area_name)
        : null,
      payment_gateways: paymentGateways.length ? paymentGateways : null,
    },
  })

  const { seller } = result as {
    seller: { id: string }
    store_profile?: { happilee_api_key?: unknown }
  }

  // Owner @handle (member_profile) upsert — mirrors the M2 create route. The
  // owner member may have been created during submit, so resolve it from the
  // seller ownership link when the request had no member yet.
  if (ownerHandle) {
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
          handle: ownerHandle,
        })
      } else {
        await service.createMemberProfiles({
          member_id: memberId,
          handle: ownerHandle,
        })
      }
    }
  }

  const { store_profile, ...restStore } = result as {
    store_profile?: { happilee_api_key?: unknown }
    [key: string]: unknown
  }
  res.status(201).json({
    store: { ...restStore, store_profile: sanitizeStoreProfile(store_profile) },
    seller_id: seller.id,
  })
}
