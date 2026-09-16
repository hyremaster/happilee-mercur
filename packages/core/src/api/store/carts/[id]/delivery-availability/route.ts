import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { checkCartDeliveryAvailability } from "../../delivery"

/**
 * GET /store/carts/:id/delivery-availability
 *
 * Check whether the cart's selected shipping address is serviceable by every
 * seller in the cart, using their Area Sense delivery areas. Same logic the
 * cart-completion guard runs, exposed as a read-only pre-check so the
 * storefront can validate an address before checkout.
 *
 * Returns 200 with `{ deliverable, location, sellers[] }` (does not throw when
 * undeliverable — inspect `deliverable`).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const availability = await checkCartDeliveryAvailability(
    req.scope,
    req.params.id
  )

  res.json(availability)
}
