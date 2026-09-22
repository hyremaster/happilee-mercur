import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import {
  codAmountRestriction,
  COD_PROVIDER_ID,
  getSellerOrderValues,
  isProviderAllowedForStore,
  toAmount,
} from "../../../payment-rules"

const COD_LABEL = "Cash on Delivery"
const ONLINE_LABEL = "Online Payment"

// Human label for a provider id. Only two provider kinds exist today: the
// system/COD provider and online gateways (razorpay).
const providerLabel = (id: string): string =>
  id === COD_PROVIDER_ID ? COD_LABEL : ONLINE_LABEL

type PaymentProvider = { id: string; is_enabled?: boolean }

/**
 * GET /store/sellers/:id/payment-providers?region_id=...&cart_id=...
 *
 * Lists the payment providers available to a shopper checking out with this
 * seller. Starts from the region's enabled providers (region_id required) and
 * filters them by the seller's onboarding payment config (store_payment_config):
 *
 *  - COD (`pp_system_default`) is included only when the store enabled COD.
 *  - Online providers are included only when the store enabled online payments;
 *    if the store pinned a specific online provider (`payment_provider_id`,
 *    saved as e.g. "razorpay" for `pp_razorpay_razorpay`), only that one.
 *
 * The same rule is enforced when a payment session is started and at cart
 * completion (see ../../../payment-rules.ts), so hiding a method here is not
 * the only thing standing between a shopper and it.
 *
 * When `cart_id` is given, COD is also dropped if this seller's order value in
 * the cart is outside the store's COD minimum / maximum. The COD entry carries
 * `cod_min_amount` / `cod_max_amount` so the storefront can explain the range.
 *
 * A seller with no payment config has enabled nothing, so the list is empty.
 * This is seller-scoped on purpose: the base Medusa `/store/payment-providers`
 * route is region-scoped only and has no notion of a store's config.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const seller_id = req.params.id
  const { region_id, cart_id } = req.query as {
    region_id?: string
    cart_id?: string
  }

  if (!region_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "You must provide the region_id to list payment providers"
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: relations } = await query.graph({
    entity: "region_payment_provider",
    fields: ["payment_provider.id", "payment_provider.is_enabled"],
    filters: { region_id },
  })

  const regionProviders = relations
    .map((r: { payment_provider?: PaymentProvider }) => r.payment_provider)
    .filter((p): p is PaymentProvider => !!p)

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const [profile] = await service.listStoreProfiles(
    { seller_id },
    { relations: ["payment_config"] }
  )
  const config = profile?.payment_config

  // With a cart, COD is also held to the store's COD order-value range.
  const orderValue = cart_id
    ? (await getSellerOrderValues(req.scope, cart_id)).get(seller_id) ?? 0
    : null

  const providers = regionProviders.filter((p) => {
    if (!isProviderAllowedForStore(config, p.id)) {
      return false
    }
    if (p.id === COD_PROVIDER_ID && orderValue !== null) {
      return codAmountRestriction(config, orderValue) === null
    }
    return true
  })

  const payment_providers = providers.map((p) => ({
    ...p,
    label: providerLabel(p.id),
    // Let the storefront explain the COD range (e.g. "COD for ₹100–₹5000").
    ...(p.id === COD_PROVIDER_ID
      ? {
          cod_min_amount: toAmount(config?.cod_min_amount),
          cod_max_amount: toAmount(config?.cod_max_amount),
        }
      : {}),
  }))

  res.json({
    payment_providers,
    count: payment_providers.length,
    offset: 0,
    limit: payment_providers.length,
  })
}
