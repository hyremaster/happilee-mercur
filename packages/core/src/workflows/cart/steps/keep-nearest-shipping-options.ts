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
      location?: { id?: string | null } | null
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

/**
 * A store gets its own shipping options at every location, so a store with
 * three locations lists "Standard Shipping" three times. For each seller, keep
 * one delivery option per type (e.g. one "standard"): the one from the location
 * nearest the customer, preferring locations that have the cart's items in
 * stock. The order is then fulfilled from that location.
 *
 * Pickup options are kept per location — picking a branch is the customer's
 * choice. Locations without coordinates rank after those with them.
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

    const result: Record<string, ListedShippingOption[]> = {}

    for (const [sellerId, options] of Object.entries(input.shipping_options)) {
      const best = new Map<string, ListedShippingOption>()
      for (const option of options) {
        if (isPickup(option)) {
          continue
        }
        const key = option.type?.code ?? option.name ?? option.id
        const current = best.get(key)
        const better =
          !current ||
          (!!current.insufficient_inventory && !option.insufficient_inventory) ||
          (!!current.insufficient_inventory === !!option.insufficient_inventory &&
            distanceTo(option) < distanceTo(current))
        if (better) {
          best.set(key, option)
        }
      }

      const kept = new Set(Array.from(best.values()).map((o) => o.id))
      result[sellerId] = options.filter((o) => isPickup(o) || kept.has(o.id))
    }

    return new StepResponse(result)
  }
)
