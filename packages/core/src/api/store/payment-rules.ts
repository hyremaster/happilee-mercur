import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../modules/marketplace-profile/service"

// Medusa's "system" provider backs COD/manual payments; every other provider
// (e.g. pp_razorpay_razorpay) is an online gateway.
export const COD_PROVIDER_ID = "pp_system_default"

export type StorePaymentRules = {
  online_enabled?: boolean | null
  cod_enabled?: boolean | null
  payment_provider_id?: string | null
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
}
