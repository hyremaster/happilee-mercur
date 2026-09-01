import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"
import {
  AreaSenseLocationInput,
  checkAreaSenseLocation,
} from "../../vendor/store-onboarding/area-sense/client"

/** Per-seller delivery verdict for a cart's shipping location. */
export type SellerDeliveryResult = {
  seller_id: string
  deliverable: boolean
  /** Area Sense area ids that cover the location (empty when none). */
  matched_area_ids: string[]
  /** Set when this seller is the reason the cart is not deliverable. */
  reason?: string
}

export type CartDeliveryLocation = {
  latitude?: number
  longitude?: number
  postal_code?: string | null
}

export type CartDeliveryAvailability = {
  /** True only when every seller in the cart can deliver to the location. */
  deliverable: boolean
  location: CartDeliveryLocation
  sellers: SellerDeliveryResult[]
  /** High-level reason when not deliverable (also see per-seller reasons). */
  reason?: string
}

type CartRow = {
  id: string
  shipping_address?: {
    postal_code?: string | null
    metadata?: Record<string, unknown> | null
  } | null
  items?: {
    variant?: { product?: { seller?: { id?: string } | null } | null } | null
  }[]
}

const asNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined

/**
 * Generic delivery-availability check for a cart against its sellers' Area
 * Sense delivery areas. Reused by the cart-completion guard and the standalone
 * "check delivery availability" endpoint.
 *
 * For every distinct seller in the cart it asks Area Sense (with that seller's
 * `happilee_api_key`) whether the cart's shipping location falls inside any of
 * the seller's configured delivery areas. The cart is deliverable only when
 * every seller can deliver. A seller with no configured delivery areas is
 * treated as not deliverable.
 *
 * Location is taken from `shipping_address.metadata.latitude/longitude`
 * (preferred) or `shipping_address.postal_code` (zipcode fallback).
 */
export async function checkCartDeliveryAvailability(
  container: MedusaContainer,
  cartId: string
): Promise<CartDeliveryAvailability> {
  // Area Sense not configured (no base URL) — the integration is off in this
  // environment, so skip the check and treat the cart as deliverable rather
  // than block every checkout.
  if (!process.env.AREASENSE_API_URL) {
    return { deliverable: true, location: {}, sellers: [] }
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "shipping_address.postal_code",
      "shipping_address.metadata",
      "items.variant.product.seller.id",
    ],
    filters: { id: cartId },
  })

  const cart = carts[0] as CartRow | undefined
  if (!cart) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Cart with id: ${cartId} was not found`
    )
  }

  const metadata = cart.shipping_address?.metadata ?? {}
  const latitude = asNumber(metadata.latitude)
  const longitude = asNumber(metadata.longitude)
  const postalCode = cart.shipping_address?.postal_code ?? null

  const location: CartDeliveryLocation = { latitude, longitude, postal_code: postalCode }

  const hasCoords = latitude !== undefined && longitude !== undefined
  const hasZip = !!postalCode

  const sellerIds = Array.from(
    new Set(
      (cart.items ?? [])
        .map((i) => i.variant?.product?.seller?.id)
        .filter((id): id is string => !!id)
    )
  )

  // No sellers (e.g. empty cart) — nothing to restrict here; let the normal
  // cart validation handle emptiness.
  if (!sellerIds.length) {
    return { deliverable: true, location, sellers: [] }
  }

  if (!hasCoords && !hasZip) {
    return {
      deliverable: false,
      location,
      reason:
        "Shipping address is missing coordinates (metadata.latitude/longitude) and postal code.",
      sellers: sellerIds.map((seller_id) => ({
        seller_id,
        deliverable: false,
        matched_area_ids: [],
        reason: "No location to check.",
      })),
    }
  }

  const service = container.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const deliveryAreas = await service.listStoreDeliveryAreas({
    seller_id: sellerIds,
  })
  const areasBySeller = new Map<string, string[]>()
  for (const area of deliveryAreas) {
    const list = areasBySeller.get(area.seller_id) ?? []
    list.push(area.area_sense_id)
    areasBySeller.set(area.seller_id, list)
  }

  const profiles = await service.listStoreProfiles({ seller_id: sellerIds })
  const keyBySeller = new Map<string, string | null>()
  for (const profile of profiles) {
    keyBySeller.set(profile.seller_id, profile.happilee_api_key ?? null)
  }

  // One Area Sense call per seller (each with its own key) — run in parallel.
  const sellers: SellerDeliveryResult[] = await Promise.all(
    sellerIds.map(async (seller_id): Promise<SellerDeliveryResult> => {
      const areaIds = areasBySeller.get(seller_id) ?? []

      // No configured delivery areas => cannot deliver (marketplace policy).
      if (!areaIds.length) {
        return {
          seller_id,
          deliverable: false,
          matched_area_ids: [],
          reason: "Seller has no configured delivery areas.",
        }
      }

      const areas: AreaSenseLocationInput[] = areaIds.map((area_id) =>
        hasCoords
          ? { area_id, latitude, longitude }
          : { area_id, zipcode: postalCode as string }
      )

      const results = await checkAreaSenseLocation(areas, {
        apiKey: keyBySeller.get(seller_id) ?? undefined,
      })

      const matched = results
        .filter((r) => r.is_deliverable)
        .map((r) => r.area_id)

      return {
        seller_id,
        deliverable: matched.length > 0,
        matched_area_ids: matched,
        reason: matched.length
          ? undefined
          : "Location outside seller's delivery areas.",
      }
    })
  )

  const deliverable = sellers.every((s) => s.deliverable)

  return {
    deliverable,
    location,
    sellers,
    reason: deliverable
      ? undefined
      : "One or more sellers cannot deliver to this location.",
  }
}
