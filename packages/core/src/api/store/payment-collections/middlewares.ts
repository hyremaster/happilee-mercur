import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { assertCartPaymentProviderAllowed } from "../payment-rules"

/**
 * Refuse to start a payment session with a method the cart's store did not
 * enable (e.g. COD on an online-only store). Medusa's route only checks that
 * the provider is enabled for the region.
 */
async function enforceStorePaymentProvider(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const providerId = (req.body as { provider_id?: unknown } | undefined)
      ?.provider_id
    if (typeof providerId !== "string" || !providerId) {
      // Let Medusa's own validation report the missing provider.
      return next()
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "payment_collection",
      fields: ["id", "cart.id"],
      filters: { id: req.params.id },
    })
    const cartId = (data[0] as { cart?: { id?: string } | null } | undefined)
      ?.cart?.id
    if (!cartId) {
      return next()
    }

    await assertCartPaymentProviderAllowed(req.scope, cartId, providerId)
    return next()
  } catch (e) {
    return next(e)
  }
}

export const storePaymentCollectionsMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/store/payment-collections/:id/payment-sessions",
    middlewares: [enforceStorePaymentProvider],
  },
]
