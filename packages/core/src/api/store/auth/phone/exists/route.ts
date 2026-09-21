import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { normalizePhone } from "../util"
import { StorePhoneExistsType } from "../validators"

/**
 * POST /store/auth/phone/exists
 *
 * Body: { phone }
 *
 * Pre-auth check so the storefront can branch its flow (returning login vs new
 * signup) before sending an OTP / running Firebase sign-in. Returns whether a
 * customer already exists for this phone (across both phone channels, since
 * accounts are unified by phone).
 *
 * Unauthenticated (there's no session yet) but still behind the publishable-key
 * guard. Deliberately minimal — returns only `{ exists }` and takes the phone in
 * the POST body (not the URL) to limit account enumeration and keep numbers out
 * of request logs. Rate-limit at the edge if abuse is a concern.
 */
export const POST = async (
  req: MedusaRequest<StorePhoneExistsType>,
  res: MedusaResponse
) => {
  const phone = normalizePhone(req.validatedBody.phone)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id"],
    filters: { phone },
  })

  // Accounts are per store, so "returning shopper" is a per-store question: a
  // customer of another store must read as new here, or the storefront shows
  // the wrong branch of the login flow.
  const seller = req.store_seller_context
  if (seller && customers.length) {
    const { data: links } = await query.graph({
      entity: "seller_customer",
      fields: ["customer_id"],
      filters: {
        seller_id: seller.seller_id,
        customer_id: (customers as { id: string }[]).map((c) => c.id),
      },
    })
    return res.json({ exists: links.length > 0 })
  }

  res.json({ exists: customers.length > 0 })
}
