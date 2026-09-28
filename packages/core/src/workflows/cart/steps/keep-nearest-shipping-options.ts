import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"

type Coords = { latitude: number; longitude: number }

type ListedShippingOption = {
  id: string
  name?: string | null
  insufficient_inventory?: boolean
  type?: { code?: string | null } | null
  service_zone?: {
    fulfillment_set?: {
      type?: string | null
      location?: { id?: string | null; name?: string | null } | null
    } | null
  } | null
}

export type KeepNearestShippingOptionsInput = {
  shipping_options: Record<string, ListedShippingOption[]>
  shipping_address?: { metadata?: Record<string, unknown> | null } | null
}

const asNumber = (value: unknown): number | undefined => {
  const n = typeof value === "string" ? Number(value) : value
  return typeof n === "number" && Number.isFinite(n) ? n : undefined
}

const toCoords = (latitude: unknown, longitude: unknown): Coords | null => {
  const lat = asNumber(latitude)
  const lng = asNumber(longitude)
  return lat === undefined || lng === undefined
    ? null
    : { latitude: lat, longitude: lng }
}

/** Great-circle distance in km. */
const distanceKm = (a: Coords, b: Coords): number => {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLng = rad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

const locationId = (option: ListedShippingOption) =>
  option.service_zone?.fulfillment_set?.location?.id ?? null

const isPickup = (option: ListedShippingOption) =>
  option.service_zone?.fulfillment_set?.type === "pickup"

/** "Pickup" → "Pickup – Palayam", so a store's pickup points can be told apart. */
const withLocationName = (option: ListedShippingOption): ListedShippingOption => {
  const location = option.service_zone?.fulfillment_set?.location?.name?.trim()
  const name = option.name?.trim()
  if (!location || !name || name.includes(location)) {
    return option
  }
  return { ...option, name: `${name} – ${location}` }
}

/**
 * A store gets its own shipping options at every location, so a store with
 * three locations lists "Standard Shipping" three times. For each seller, keep
 * one delivery option per type (e.g. one "standard"): the one from the location
 * nearest the customer, preferring locations that have the cart's items in
 * stock. The order is then fulfilled from that location.
 *
 * Pickup options are kept per location — picking a branch is the customer's
 * choice — and named after it. Locations without coordinates rank after those
 * with them.
 *
 * As a fallback, the list is then made distinct by kind (pickup / delivery)
 * and shown name, keeping the best-ranked option, so the customer never sees
 * two identical entries (e.g. two branches with the same name, or delivery
 * options sharing a name under different type codes).
 */
export const keepNearestShippingOptionsStep = createStep(
  "keep-nearest-shipping-options",
  async (input: KeepNearestShippingOptionsInput, { container }) => {
    const customer = toCoords(
      input.shipping_address?.metadata?.latitude,
      input.shipping_address?.metadata?.longitude
    )

    const locationIds = Array.from(
      new Set(
        Object.values(input.shipping_options)
          .flat()
          .map(locationId)
          .filter((id): id is string => !!id)
      )
    )

    const details = locationIds.length
      ? await container
          .resolve<MarketplaceProfileModuleService>(MercurModules.MARKETPLACE_PROFILE)
          .listStoreLocationDetails({ stock_location_id: locationIds })
      : []
    const coordsByLocation = new Map(
      details.map((d) => [d.stock_location_id, toCoords(d.latitude, d.longitude)])
    )

    const distanceTo = (option: ListedShippingOption): number => {
      const id = locationId(option)
      const coords = id ? coordsByLocation.get(id) : null
      return customer && coords ? distanceKm(customer, coords) : Infinity
    }

    // Lower is better: in stock first, then nearest.
    const isBetter = (a: ListedShippingOption, b: ListedShippingOption) => {
      const aShort = !!a.insufficient_inventory
      const bShort = !!b.insufficient_inventory
      if (aShort !== bShort) {
        return !aShort
      }
      return distanceTo(a) < distanceTo(b)
    }

    /** Keep the best option per key; the rest are dropped, order preserved. */
    const distinctBy = (
      options: ListedShippingOption[],
      keyOf: (option: ListedShippingOption) => string
    ) => {
      const best = new Map<string, ListedShippingOption>()
      for (const option of options) {
        const key = keyOf(option)
        const current = best.get(key)
        if (!current || isBetter(option, current)) {
          best.set(key, option)
        }
      }
      const kept = new Set(Array.from(best.values()).map((o) => o.id))
      return options.filter((o) => kept.has(o.id))
    }

    const kind = (option: ListedShippingOption) =>
      isPickup(option) ? "pickup" : "delivery"

    const result: Record<string, ListedShippingOption[]> = {}

    for (const [sellerId, options] of Object.entries(input.shipping_options)) {
      // One delivery option per type; pickups stay per location, named after it.
      const perType = distinctBy(options, (o) =>
        isPickup(o) ? `pickup:${o.id}` : `delivery:${o.type?.code ?? o.name ?? o.id}`
      ).map((o) => (isPickup(o) ? withLocationName(o) : o))

      // Fallback: never two entries of the same kind with the same shown name.
      result[sellerId] = distinctBy(
        perType,
        (o) => `${kind(o)}:${(o.name ?? o.id).trim().toLowerCase()}`
      )
    }

    return new StepResponse(result)
  }
)
