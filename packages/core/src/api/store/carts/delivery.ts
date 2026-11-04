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
  shipping_methods?: { shipping_option_id?: string | null }[]
}

const PICKUP_FULFILLMENT_SET = "pickup"

type SellerShippingOption = {
  seller?: { id?: string } | null
  service_zone?: { fulfillment_set?: { type?: string } | null } | null
}

const isPickup = (option: SellerShippingOption) =>
  option.service_zone?.fulfillment_set?.type === PICKUP_FULFILLMENT_SET

/** Sellers whose chosen shipping methods in this cart are all pickup. */
async function sellersPickingUp(
  container: MedusaContainer,
  cart: CartRow
): Promise<Set<string>> {
  const optionIds = (cart.shipping_methods ?? [])
    .map((method) => method.shipping_option_id)
    .filter((id): id is string => !!id)
  if (!optionIds.length) {
    return new Set()
  }
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "shipping_option",
      fields: ["id", "seller.id", "service_zone.fulfillment_set.type"],
      filters: { id: optionIds },
    })
  const options = data as unknown as SellerShippingOption[]
  const delivering = new Set(
    options.filter((option) => !isPickup(option)).map((option) => option.seller?.id)
  )
  return new Set(
    options
      .map((option) => option.seller?.id)
      .filter((id): id is string => !!id && !delivering.has(id))
  )
}

/** Of these sellers, the ones with a pickup option a customer could still choose. */
async function sellersOfferingPickup(
  container: MedusaContainer,
  sellerIds: string[]
): Promise<Set<string>> {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "seller",
      fields: ["id", "shipping_options.service_zone.fulfillment_set.type"],
      filters: { id: sellerIds },
    })
  return new Set(
    (data as unknown as { id: string; shipping_options?: SellerShippingOption[] }[])
      .filter((seller) => (seller.shipping_options ?? []).some(isPickup))
      .map((seller) => seller.id)
  )
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
 * treated as not deliverable, as is a seller whose Area Sense call fails — one
 * seller's failure never aborts the check for the rest of the cart.
 *
 * Location is taken from `shipping_address.metadata.latitude/longitude`
 * (preferred) or `shipping_address.postal_code` (zipcode fallback).
 *
 * A seller whose chosen methods in the cart are all pickup delivers nothing, so
 * its delivery areas don't apply and Area Sense isn't asked about it.
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
      "shipping_methods.shipping_option_id",
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

  const cartSellerIds = Array.from(
    new Set(
      (cart.items ?? [])
        .map((i) => i.variant?.product?.seller?.id)
        .filter((id): id is string => !!id)
    )
  )

  // No sellers (e.g. empty cart) — nothing to restrict here; let the normal
  // cart validation handle emptiness.
  if (!cartSellerIds.length) {
    return { deliverable: true, location, sellers: [] }
  }

  const pickingUp = await sellersPickingUp(container, cart)
  const pickupResults: SellerDeliveryResult[] = cartSellerIds
    .filter((seller_id) => pickingUp.has(seller_id))
    .map((seller_id) => ({ seller_id, deliverable: true, matched_area_ids: [] }))
  const sellerIds = cartSellerIds.filter((seller_id) => !pickingUp.has(seller_id))
  if (!sellerIds.length) {
    return { deliverable: true, location, sellers: pickupResults }
  }

  if (!hasCoords && !hasZip) {
    return {
      deliverable: false,
      location,
      reason:
        "Shipping address is missing coordinates (metadata.latitude/longitude) and postal code.",
      sellers: [
        ...pickupResults,
        ...sellerIds.map((seller_id) => ({
          seller_id,
          deliverable: false,
          matched_area_ids: [],
          reason: "No location to check.",
        })),
      ],
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
  const checked: SellerDeliveryResult[] = await Promise.all(
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

      // Send BOTH coordinates and zipcode when available so Area Sense can use
      // whichever fits the area's type (geo_locations vs zip_codes) — a seller
      // may have either kind of area, and the address usually carries both.
      const areas: AreaSenseLocationInput[] = areaIds.map((area_id) => ({
        area_id,
        ...(hasCoords ? { latitude, longitude } : {}),
        ...(hasZip ? { zipcode: postalCode as string } : {}),
      }))

      // A seller whose Area Sense call fails (misconfigured/rejected key,
      // provider down) must not fail the whole cart: the other sellers are
      // still checked and this seller is reported as not deliverable with the
      // failure as its reason.
      let results: Awaited<ReturnType<typeof checkAreaSenseLocation>>
      try {
        results = await checkAreaSenseLocation(areas, {
          apiKey: keyBySeller.get(seller_id) ?? undefined,
        })
      } catch (e) {
        return {
          seller_id,
          deliverable: false,
          matched_area_ids: [],
          reason: `Delivery check failed for this seller: ${
            (e as Error).message
          }`,
        }
      }

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

  const sellers = [...pickupResults, ...checked]
  const deliverable = sellers.every((s) => s.deliverable)

  return {
    deliverable,
    location,
    sellers,
    reason: deliverable
      ? undefined
      : "Delivery is not available at this location.",
  }
}

/**
 * Guard used by cart create/update: when the cart has a shipping address, run
 * the same delivery-availability check as the completion guard and throw
 * NOT_ALLOWED if any seller can't deliver. No-op when the cart has no shipping
 * address yet (address is optional on create/update — the completion guard is
 * the final gate). Reuses checkCartDeliveryAvailability so the rule stays in one
 * place. A seller offering pickup isn't refused here, because the customer may
 * not have chosen a method yet; the completion guard refuses delivery there.
 */
export async function assertCartDeliverableIfAddressPresent(
  container: MedusaContainer,
  cartId: string
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "shipping_address.postal_code",
      "shipping_address.metadata",
    ],
    filters: { id: cartId },
  })
  const cart = data[0] as CartRow | undefined

  // Only validate once the cart has a usable shipping location. Medusa attaches
  // an empty shipping_address on create, so presence of the address alone isn't
  // enough — require coordinates or a postal code (the same signals the check
  // uses). Without them there is nothing to match against; the completion guard
  // remains the final gate.
  const metadata = cart?.shipping_address?.metadata ?? {}
  const hasCoords =
    asNumber(metadata.latitude) !== undefined &&
    asNumber(metadata.longitude) !== undefined
  const hasZip = !!cart?.shipping_address?.postal_code
  if (!hasCoords && !hasZip) {
    return
  }

  const availability = await checkCartDeliveryAvailability(container, cartId)
  if (availability.deliverable) {
    return
  }
  const refused = availability.sellers
    .filter((seller) => !seller.deliverable)
    .map((seller) => seller.seller_id)
  const offeringPickup = await sellersOfferingPickup(container, refused)
  if (refused.length && refused.every((id) => offeringPickup.has(id))) {
    return
  }
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    availability.reason ?? "Delivery is not available to the selected address."
  )
}
