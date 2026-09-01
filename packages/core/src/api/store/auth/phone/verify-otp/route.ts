import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { IAuthModuleService } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/core-flows"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import { normalizePhone } from "../util"
import { StoreVerifyPhoneOtpType } from "../validators"

// Auth provider key under which phone identities are stored. This is a virtual
// provider (no registered AbstractAuthModuleProvider) — we own the whole flow,
// so the string only needs to be stable and unique.
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

  const authService = req.scope.resolve<IAuthModuleService>(Modules.AUTH)

  // Find (or create) the phone auth identity.
  const existing = await authService.listAuthIdentities(
    {
      provider_identities: {
        entity_id: phone,
        provider: PHONE_AUTH_PROVIDER,
      },
    },
    { relations: ["provider_identities"] }
  )

  let authIdentity =
    existing[0] ??
    (await authService.createAuthIdentities({
      provider_identities: [
        { provider: PHONE_AUTH_PROVIDER, entity_id: phone },
      ],
    }))

  let customerId = authIdentity.app_metadata?.customer_id as string | undefined

  // First login for this phone — create the Customer and link it to the
  // identity (the workflow sets app_metadata.customer_id).
  if (!customerId) {
    // Medusa customers require an email. When the shopper only gave a phone,
    // synthesize a stable, unique placeholder from the number so the account
    // can be created (domain is env-tunable).
    const emailDomain =
      process.env.PHONE_CUSTOMER_EMAIL_DOMAIN || "phone.happilee.local"
    const customerEmail =
      email || `${phone.replace(/[^\d]/g, "")}@${emailDomain}`

    const { result: customer } = await createCustomerAccountWorkflow(
      req.scope
    ).run({
      input: {
        authIdentityId: authIdentity.id,
        customerData: {
          phone,
          email: customerEmail,
          ...(first_name ? { first_name } : {}),
          ...(last_name ? { last_name } : {}),
        },
      },
    })
    customerId = customer.id
    authIdentity = await authService.retrieveAuthIdentity(authIdentity.id)
  }

  const { http } = req.scope.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  ).projectConfig

  const token = generateJwtToken(
    {
      actor_id: customerId,
      actor_type: "customer",
      auth_identity_id: authIdentity.id,
      app_metadata: { customer_id: customerId },
      user_metadata: {},
    },
    {
      secret: http.jwtSecret,
      expiresIn: http.jwtExpiresIn,
      jwtOptions: http.jwtOptions,
    }
  )

  res.status(200).json({ token })
}
