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
import { syncStoreFulfillmentOptionsWorkflow } from "../../../../workflows/marketplace-profile/workflows/sync-store-fulfillment-options"
import { VendorUpdateStoreType } from "../validators"
import {
  assertStoreOwnership,
  deactivateSiblingGateways,
  maskGateway,
  sanitizeStoreProfile,
  isMaskedSecret,
  prepareRazorpayGatewayForSave,
  validateGatewayCredentials,
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

  // The wizard saves payment settings through this route, so gateway
  // credentials are verified against the provider before anything is written:
  // a store must never end up with keys that do not authenticate.
  for (const entry of body.payment_gateways ??
    (body.payment_gateway ? [body.payment_gateway] : [])) {
    await validateGatewayCredentials(entry.gateway, entry.credentials)
  }

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

  // Methods enabled after onboarding need their shipping infrastructure too;
  // storing the list alone never reaches checkout. Only missing pieces are
  // created, so re-saving the same methods is a no-op.
  if (body.fulfillment_methods !== undefined) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [seller],
    } = await query.graph({
      entity: "seller",
      fields: ["id", "currency_code", "address.country_code"],
      filters: { id: sellerId },
    })
    const { data: sellerLocations } = await query.graph({
      entity: "stock_location_seller",
      fields: ["stock_location_id"],
      filters: { seller_id: sellerId },
    })
    const sellerRow = seller as
      | {
          currency_code?: string | null
          address?: { country_code?: string | null } | null
        }
      | undefined

    await syncStoreFulfillmentOptionsWorkflow(req.scope).run({
      input: {
        seller_id: sellerId,
        currency_code: sellerRow?.currency_code ?? "inr",
        country_code: sellerRow?.address?.country_code ?? null,
        fulfillment_methods: body.fulfillment_methods,
        location_ids: Array.from(
          new Set(
            (sellerLocations as { stock_location_id: string }[])
              .map((l) => l.stock_location_id)
              .filter(Boolean)
          )
        ),
      },
    })
  }

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

  // Payment gateways (many-of-same-type).
  //  - `payment_gateways` (array) is the full desired set (replace-all/sync):
  //    entries with `id` are updated, entries without `id` are created, and
  //    existing rows absent from the payload are deleted.
  //  - legacy singular `payment_gateway` is a non-destructive upsert (never
  //    deletes siblings).
  // Credentials stored raw; masked on read (length-preserving, first+last shown).
  // On update, a credentials object whose secret is masked (contains the mask
  // bullet) is treated as "unchanged" and skipped, so a client round-tripping a
  // masked read never clobbers the stored secret.
  const isReplaceAll = body.payment_gateways !== undefined
  const gatewayEntries =
    body.payment_gateways ??
    (body.payment_gateway ? [body.payment_gateway] : undefined)
  if (gatewayEntries) {
    if (isReplaceAll) {
      const existing = await service.listStorePaymentGateways({
        seller_id: sellerId,
      })
      const keepIds = new Set(
        gatewayEntries
          .map((e) => e.id)
          .filter((id): id is string => Boolean(id))
      )
      const staleIds = existing
        .filter((g) => !keepIds.has(g.id))
        .map((g) => g.id)
      if (staleIds.length) {
        await service.deleteStorePaymentGateways(staleIds)
      }
    }

    // Gateways saved together can share a Razorpay account (one webhook secret).
    const batchSecrets = new Map<string, string>()
    const existingById = new Map(
      (await service.listStorePaymentGateways({ seller_id: sellerId })).map(
        (g) => [g.id, g]
      )
    )

    for (const entry of gatewayEntries) {
      const { id, gateway, label, is_active, credentials, metadata } = entry
      // Single-active invariant: deactivate siblings before activating this one.
      if (is_active) {
        await deactivateSiblingGateways(service, sellerId, gateway, id)
      }
      const credentialsMasked = isMaskedSecret(credentials?.key_secret)

      // New (unmasked) Razorpay credentials: register the webhook. Best-effort
      // so a Razorpay outage never blocks saving the rest of the store.
      let nextCredentials = credentials
      let webhookMetadata: Record<string, unknown> = {}
      if (!credentialsMasked) {
        const existing = id ? existingById.get(id) : undefined
        const prevSecret = (
          existing?.credentials as Record<string, unknown> | null | undefined
        )?.webhook_secret
        const prepared = await prepareRazorpayGatewayForSave(
          service,
          gateway,
          credentials as Record<string, unknown> | null | undefined,
          {
            previousWebhookSecret:
              typeof prevSecret === "string" ? prevSecret : undefined,
            gatewayId: id,
            batchSecrets,
            bestEffort: true,
          }
        )
        nextCredentials = prepared.credentials as typeof credentials
        webhookMetadata = prepared.metadata
      }

      if (id) {
        const existingMetadata =
          (existingById.get(id)?.metadata as Record<string, unknown> | null) ??
          {}
        const mergedMetadata =
          metadata !== undefined
            ? { ...(metadata ?? {}), ...webhookMetadata }
            : Object.keys(webhookMetadata).length
              ? { ...existingMetadata, ...webhookMetadata }
              : undefined
        await service.updateStorePaymentGateways({
          id,
          label,
          is_active: is_active ?? false,
          ...(credentialsMasked ? {} : { credentials: nextCredentials }),
          ...(mergedMetadata !== undefined ? { metadata: mergedMetadata } : {}),
        })
      } else {
        await service.createStorePaymentGateways({
          seller_id: sellerId,
          gateway,
          label,
          is_active: is_active ?? false,
          credentials: nextCredentials,
          metadata: Object.keys(webhookMetadata).length
            ? { ...(metadata ?? {}), ...webhookMetadata }
            : metadata ?? null,
        })
      }
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
