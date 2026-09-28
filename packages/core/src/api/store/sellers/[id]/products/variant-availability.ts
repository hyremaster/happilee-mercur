import { RemoteQueryFunction } from "@medusajs/framework/types"
import {
  getTotalVariantAvailability,
  getVariantAvailability,
} from "@medusajs/framework/utils"

import {
  isVariantAvailable,
  VariantAvailabilityState,
} from "../../../../../modules/variant-availability/utils/is-variant-available"

type ListedVariant = {
  id: string
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  variant_availability?: (VariantAvailabilityState & Record<string, unknown>) | null
}

type ListedProduct = {
  variants?: ListedVariant[] | null
}

/**
 * Resolve each variant's `variant_availability.is_available` to whether a
 * shopper can buy it right now: the vendor has not marked it unavailable (or
 * the mark has expired) AND, when its inventory is tracked without backorders,
 * it has stock left in the store's sales channel. The storefront reads only
 * this flag, so stock quantities are never sent to it.
 *
 * Variants with no availability record that are buyable keep
 * `variant_availability: null`, as before.
 */
export async function resolveVariantAvailability(
  query: Omit<RemoteQueryFunction, symbol>,
  products: ListedProduct[],
  salesChannelIds: string[]
): Promise<void> {
  const variants = products.flatMap((product) => product.variants ?? [])

  const trackedIds = variants
    .filter((variant) => variant.manage_inventory && !variant.allow_backorder)
    .map((variant) => variant.id)

  const inStock = new Set<string>(variants.map((variant) => variant.id))

  if (trackedIds.length) {
    // Same rule as Medusa's own inventory_quantity: stock is counted per sales
    // channel when the publishable key pins exactly one.
    const availability =
      salesChannelIds.length === 1
        ? await getVariantAvailability(query, {
            variant_ids: trackedIds,
            sales_channel_id: salesChannelIds[0],
          })
        : await getTotalVariantAvailability(query, { variant_ids: trackedIds })

    for (const id of trackedIds) {
      const quantity = availability[id]?.availability
      // null = no inventory item linked; leave it to the cart to decide.
      if (quantity !== null && quantity !== undefined && quantity <= 0) {
        inStock.delete(id)
      }
    }
  }

  const now = new Date()
  for (const variant of variants) {
    const record = variant.variant_availability ?? null
    const available =
      isVariantAvailable(record, now) && inStock.has(variant.id)

    if (!record && available) {
      continue
    }

    variant.variant_availability = {
      ...(record ?? { unavailable_until: null }),
      is_available: available,
    }
  }
}
