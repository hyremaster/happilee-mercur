import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"

// Medusa's "system" provider backs COD/manual payments; every other provider
// (e.g. pp_razorpay_razorpay) is an online gateway.
const COD_PROVIDER_ID = "pp_system_default"

const COD_LABEL = "Cash on Delivery"
const ONLINE_LABEL = "Online Payment"

// Human label for a provider id. Only two provider kinds exist today: the
// system/COD provider and online gateways (razorpay).
const providerLabel = (id: string): string =>
  id === COD_PROVIDER_ID ? COD_LABEL : ONLINE_LABEL

type PaymentProvider = { id: string; is_enabled?: boolean }

/**
 * GET /store/sellers/:id/payment-providers?region_id=...
 *
 * Lists the payment providers available to a shopper checking out with this
 * seller. Starts from the region's enabled providers (region_id required) and
 * filters them by the seller's onboarding payment config (store_payment_config):
 *
 *  - COD (`pp_system_default`) is included only when the store enabled COD.
 *  - Online providers are included only when the store enabled online payments;
 *    if the store pinned a specific online provider (`payment_provider_id`),
 *    only that provider is kept.
 *
 * A seller with no payment config has enabled nothing, so the list is empty.
 * This is seller-scoped on purpose: the base Medusa `/store/payment-providers`
 * route is region-scoped only and has no notion of a store's config.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const seller_id = req.params.id
  const { region_id } = req.query as { region_id?: string }

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

  const providers = regionProviders.filter((p) => {
    if (p.id === COD_PROVIDER_ID) {
      return !!config?.cod_enabled
    }
    // Online provider: gated by online_enabled, and pinned to the store's
    // chosen provider when it set one.
    if (!config?.online_enabled) {
      return false
    }
    if (config.payment_provider_id) {
      return p.id === config.payment_provider_id
    }
    return true
  })

  const payment_providers = providers.map((p) => ({
    ...p,
    label: providerLabel(p.id),
  }))

  res.json({
    payment_providers,
    count: payment_providers.length,
    offset: 0,
    limit: payment_providers.length,
  })
}
