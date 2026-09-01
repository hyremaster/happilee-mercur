import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import { normalizePhone } from "../util"
import { StoreSendPhoneOtpType } from "../validators"
import { sendWhatsappOtp } from "../whatsapp"

/**
 * POST /store/auth/phone/send-otp
 *
 * Body: { phone }
 *
 * Generates a one-time password for the phone number and delivers it over
 * WhatsApp. Always returns 200 `{ status: "sent" }` on success (never reveals
 * whether the number already has a customer account). Throttled per phone by
 * the OTP module.
 */
export const POST = async (
  req: MedusaRequest<StoreSendPhoneOtpType>,
  res: MedusaResponse
) => {
  const phone = normalizePhone(req.validatedBody.phone)

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const { code, expires_at } = await service.requestPhoneOtp(phone)

  // Deliver out of band. If WhatsApp send fails, surface the error so the
  // client can retry (the code stays live until it expires).
  await sendWhatsappOtp(phone, code)

  res.status(200).json({ status: "sent", expires_at })
}
