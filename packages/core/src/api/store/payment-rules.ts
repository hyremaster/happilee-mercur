import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  decorateCartTotals,
  MathBN,
  MedusaError,
} from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../modules/marketplace-profile/service"

// Medusa's "system" provider backs COD/manual payments; every other provider
// (e.g. pp_razorpay_razorpay) is an online gateway.
export const COD_PROVIDER_ID = "pp_system_default"

type AmountLike = number | string | { toString(): string } | null | undefined

export type StorePaymentRules = {
  online_enabled?: boolean | null
  cod_enabled?: boolean | null
  payment_provider_id?: string | null
  cod_min_amount?: AmountLike
  cod_max_amount?: AmountLike
  currency_code?: string | null
}

/** Store COD limits are bigNumber columns; read them as plain numbers. */
export function toAmount(value: AmountLike): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const n = Number(typeof value === "object" ? value.toString() : value)
  return Number.isFinite(n) ? n : null
}

/**
 * Why COD is not available for an order of `amount`, or null when it is. The
 * store's minimum / maximum COD order value are inclusive; an unset bound does
 * not limit.
 */
export function codAmountRestriction(
  config: StorePaymentRules | null | undefined,
  amount: number
): string | null {
  const min = toAmount(config?.cod_min_amount)
  const max = toAmount(config?.cod_max_amount)
  if ((min === null || amount >= min) && (max === null || amount <= max)) {
    return null
  }
  const currency = config?.currency_code
    ? ` ${config.currency_code.toUpperCase()}`
    : ""
  if (min !== null && max !== null) {
    return `Cash on Delivery is available only for orders between ${min} and ${max}${currency}.`
  }
  if (min !== null) {
    return `Cash on Delivery is available only for orders of at least ${min}${currency}.`
  }
  return `Cash on Delivery is available only for orders up to ${max}${currency}.`
}

type CartItemForTotals = {
  unit_price?: unknown
  quantity?: unknown
  is_tax_inclusive?: boolean | null
  tax_lines?: unknown[] | null
  adjustments?: unknown[] | null
  variant?: { product?: { seller?: { id?: string } | null } | null } | null
}

/**
 * Each seller's order value in the cart: the total of that seller's items
 * after discounts, including tax (shipping excluded), in major units.
 */
export async function getSellerOrderValues(
  container: MedusaContainer,
  cartId: string
): Promise<Map<string, number>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "items.unit_price",
      "items.quantity",
      "items.is_tax_inclusive",
      "items.tax_lines.rate",
      "items.adjustments.amount",
      "items.variant.product.seller.id",
    ],
    filters: { id: cartId },
  })
  const items = ((carts[0] as { items?: (CartItemForTotals | null)[] } | undefined)
    ?.items ?? []).filter((i): i is CartItemForTotals => !!i)

  const bySeller = new Map<string, CartItemForTotals[]>()
  for (const item of items) {
    const sellerId = item.variant?.product?.seller?.id
    if (!sellerId) {
      continue
    }
    bySeller.set(sellerId, [...(bySeller.get(sellerId) ?? []), item])
  }

  const values = new Map<string, number>()
  for (const [sellerId, sellerItems] of bySeller) {
    const totals = decorateCartTotals(
      { items: sellerItems } as Parameters<typeof decorateCartTotals>[0],
      { includeTaxes: true }
    ) as { item_total?: Parameters<typeof MathBN.convert>[0] }
    values.set(
      sellerId,
      totals.item_total !== undefined
        ? MathBN.convert(totals.item_total).toNumber()
        : 0
    )
  }
  return values
}

/**
 * Whether a store's payment config lets shoppers pay with `providerId`.
 *
 * - COD (`pp_system_default`) only when the store enabled COD.
 * - Online providers only when the store enabled online payments; when the store
 *   pinned a gateway, only that one. The wizard saves the gateway by its short
 *   name ("razorpay") while Medusa ids are `pp_<identifier>_<id>`
 *   ("pp_razorpay_razorpay"), so both forms match.
 * - No config means nothing is enabled.
 */
export function isProviderAllowedForStore(
  config: StorePaymentRules | null | undefined,
  providerId: string
): boolean {
  if (!config) {
    return false
  }
  if (providerId === COD_PROVIDER_ID) {
    return !!config.cod_enabled
  }
  if (!config.online_enabled) {
    return false
  }
  const pinned = config.payment_provider_id?.trim()
  if (!pinned) {
    return true
  }
  return providerId === pinned || providerId.startsWith(`pp_${pinned}_`)
}

/**
 * Throw NOT_ALLOWED unless every seller with items in the cart accepts
 * `providerId`. A cart spanning several stores can only use a method all of
 * them offer.
 */
export async function assertCartPaymentProviderAllowed(
  container: MedusaContainer,
  cartId: string,
  providerId: string
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "items.variant.product.seller.id"],
    filters: { id: cartId },
  })
  const cart = carts[0] as
    | {
        items?: ({
          variant?: { product?: { seller?: { id?: string } | null } | null } | null
        } | null)[]
      }
    | undefined

  const sellerIds = Array.from(
    new Set(
      (cart?.items ?? [])
        .map((item) => item?.variant?.product?.seller?.id)
        .filter((id): id is string => !!id)
    )
  )
  // Nothing seller-owned in the cart (e.g. empty): nothing to restrict here.
  if (!sellerIds.length) {
    return
  }

  const service = container.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  const profiles = await service.listStoreProfiles(
    { seller_id: sellerIds },
    { relations: ["payment_config"] }
  )
  const configBySeller = new Map(
    profiles.map((p) => [p.seller_id, p.payment_config ?? null])
  )

  const refused = sellerIds.filter(
    (id) => !isProviderAllowedForStore(configBySeller.get(id), providerId)
  )
  if (refused.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      providerId === COD_PROVIDER_ID
        ? "Cash on Delivery is not available for this store."
        : "This payment method is not available for this store."
    )
  }

  // COD also has to fit each store's minimum / maximum COD order value.
  if (providerId === COD_PROVIDER_ID) {
    const orderValues = await getSellerOrderValues(container, cartId)
    for (const sellerId of sellerIds) {
      const restriction = codAmountRestriction(
        configBySeller.get(sellerId),
        orderValues.get(sellerId) ?? 0
      )
      if (restriction) {
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, restriction)
      }
    }
  }
}
