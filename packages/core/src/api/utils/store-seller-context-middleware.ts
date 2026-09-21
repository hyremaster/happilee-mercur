import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { SellerStatus } from "@mercurjs/types"

const SELLER_HANDLE_HEADER = "x-seller-handle"
const SELLER_ID_HEADER = "x-seller-id"

/**
 * Resolve the store a /store/* request belongs to.
 *
 * The storefront serves every store under one origin,
 * so the store is not implied by the host or by the publishable key. It is sent
 * explicitly: `x-seller-handle` (what the storefront has from the path), or
 * `x-seller-id`. The resolved store lands on `req.store_seller_context` for
 * later middlewares and handlers.
 *
 * a request with no header still passes, so the storefront can adopt the header before
 * anything depends on it. A header that IS sent must name an open store —
 * silently ignoring a bad value would later hand a session to the wrong store.
 * Session binding and cart scoping build on this in phases 3 and 4.
 */
export async function attachStoreSellerContext(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const handle = req.get(SELLER_HANDLE_HEADER)
  const sellerId = req.get(SELLER_ID_HEADER)

  if (!handle && !sellerId) {
    return next()
  }

  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    const { data: sellers } = await query.graph({
      entity: "seller",
      fields: ["id", "handle", "status", "currency_code"],
      filters: sellerId ? { id: sellerId } : { handle },
    })

    const seller = sellers[0] as
      | { id: string; handle: string; status: string; currency_code: string }
      | undefined

    if (!seller) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown store: ${handle ?? sellerId}`
      )
    }

    if (seller.status !== SellerStatus.OPEN) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Store ${seller.handle} is not accepting orders.`
      )
    }

    req.store_seller_context = {
      seller_id: seller.id,
      handle: seller.handle,
      currency_code: seller.currency_code,
    }

    return next()
  } catch (e) {
    return next(e)
  }
}
