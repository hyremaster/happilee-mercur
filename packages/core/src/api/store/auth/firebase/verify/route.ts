import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { normalizePhone } from "../../phone/util"
import { mintPhoneCustomerSession } from "../../shared/mint-customer-session"
import { verifyFirebaseIdToken } from "../firebase-admin"
import { StoreFirebaseVerifyType } from "../validators"

// Auth provider key under which Firebase SMS phone identities are stored. Kept
// distinct from "phone-otp" (WhatsApp) so both channels coexist; the shared
// session minter still unifies them onto one Customer per phone.
const PHONE_FIREBASE_PROVIDER = "phone-firebase"

/**
 * POST /store/auth/firebase/verify
 *
 * Body: { id_token, first_name?, last_name?, email? }
 *
 * Exchanges a verified Firebase phone-auth ID token for a customer JWT (same
 * `{ token }` shape as `/auth/customer/emailpass`). Firebase (client SDK) has
 * already sent + verified the SMS OTP; we only trust the signed token, read the
 * verified phone number, and find/create the Customer.
 */
export const POST = async (
  req: MedusaRequest<StoreFirebaseVerifyType>,
  res: MedusaResponse
) => {
  const { id_token, first_name, last_name, email } = req.validatedBody

  const { phone: rawPhone } = await verifyFirebaseIdToken(id_token)
  const phone = normalizePhone(rawPhone)

  const token = await mintPhoneCustomerSession(req.scope, {
    phone,
    provider: PHONE_FIREBASE_PROVIDER,
    first_name,
    last_name,
    email,
  })

  res.status(200).json({ token })
}
