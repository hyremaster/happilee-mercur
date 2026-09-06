import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import { normalizePhone } from "../util"
import { StoreVerifyPhoneOtpType } from "../validators"
import { mintPhoneCustomerSession } from "../../shared/mint-customer-session"

// Auth provider key under which WhatsApp-OTP phone identities are stored. This
// is a virtual provider (no registered AbstractAuthModuleProvider) — we own the
// whole flow, so the string only needs to be stable and unique.
const PHONE_AUTH_PROVIDER = "phone-otp"

/**
 * POST /store/auth/phone/verify-otp
 *
 * Body: { phone, otp, first_name?, last_name?, email? }
 *
 * Verifies the WhatsApp OTP and returns a customer JWT (same `{ token }` shape
 * as `/auth/customer/emailpass`). On first successful verify for a phone we
 * create the auth identity and a Customer account; subsequent verifies log the
 * existing customer in.
 */
export const POST = async (
  req: MedusaRequest<StoreVerifyPhoneOtpType>,
  res: MedusaResponse
) => {
  const { otp, first_name, last_name, email } = req.validatedBody
  const phone = normalizePhone(req.validatedBody.phone)

  const profileService = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const valid = await profileService.verifyPhoneOtp(phone, otp)
  if (!valid) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "The OTP is invalid or has expired."
    )
  }

  const token = await mintPhoneCustomerSession(req.scope, {
    phone,
    provider: PHONE_AUTH_PROVIDER,
    first_name,
    last_name,
    email,
  })

  res.status(200).json({ token })
}
