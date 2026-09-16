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

  res.json({ exists: customers.length > 0 })
}
