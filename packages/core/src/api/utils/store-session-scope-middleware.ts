import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework"
import { MedusaError } from "@medusajs/framework/utils"

/**
 * Refuse a customer session that belongs to another store.
 *
 * Accounts are per store (see docs/store-scoped-customers.md), so the token
 * minted at a store carries that store in `app_metadata.seller_id`. This
 * compares it with the store the request names (`req.store_seller_context`,
 * resolved by `attachStoreSellerContext`). Without the comparison a token stays
 * valid marketplace-wide, since it is a structurally valid customer token.
 *
 * Three cases pass through untouched:
 *   - no session (guests browse and build carts; Medusa's own auth decides),
 *   - a request naming no store, while a storefront still sends no header,
 *   - a session whose store matches the request.
 *
 * A session minted before stores had accounts carries no `seller_id`. On a
 * store-scoped request it is refused: it cannot be attributed to the store in
 * front of it, and treating it as marketplace-wide is exactly the leak this
 * phase closes. The shopper signs in once more.
 */
export function enforceStoreSessionScope(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const store = req.store_seller_context
  const actorId = req.auth_context?.actor_id

  if (!store || !actorId) {
    return next()
  }

  const sessionSellerId = req.auth_context?.app_metadata?.seller_id as
    | string
    | undefined

  if (!sessionSellerId) {
    return next(
      new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "This session predates store accounts. Please sign in again."
      )
    )
  }

  if (sessionSellerId !== store.seller_id) {
    return next(
      new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "This session belongs to another store. Please sign in to this store."
      )
    )
  }

  return next()
}
