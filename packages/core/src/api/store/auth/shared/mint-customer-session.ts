import { MedusaRequest } from "@medusajs/framework/http"
import { IAuthModuleService } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/core-flows"

export type MintPhoneSessionInput = {
  /** Normalized phone (E.164, e.g. "+9198…"). */
  phone: string
  /**
   * Virtual auth-provider key the identity is stored under. Distinct per
   * channel ("phone-otp" for WhatsApp OTP, "phone-firebase" for Firebase SMS)
   * so channels coexist, while still resolving to a single Customer per phone.
   */
  provider: string
  first_name?: string
  last_name?: string
  email?: string
}

/**
 * Shared tail of every phone-login flow: resolve (or create) the auth identity
 * for `provider`+`phone`, resolve (or create) the Customer, and mint a customer
 * JWT — the same `{ token }` a normal emailpass login returns.
 *
 * Account unification: when a Customer already exists for this phone (created by
 * the OTHER phone provider), it is reused and this identity is linked to it, so
 * WhatsApp-OTP and Firebase logins for the same number share ONE account. This
 * also avoids the deterministic synthesized-email collision a fresh create would
 * hit.
 */
export async function mintPhoneCustomerSession(
  scope: MedusaRequest["scope"],
  { phone, provider, first_name, last_name, email }: MintPhoneSessionInput
): Promise<string> {
  const authService = scope.resolve<IAuthModuleService>(Modules.AUTH)

  const existing = await authService.listAuthIdentities(
    { provider_identities: { entity_id: phone, provider } },
    { relations: ["provider_identities"] }
  )

  let authIdentity =
    existing[0] ??
    (await authService.createAuthIdentities({
      provider_identities: [{ provider, entity_id: phone }],
    }))

  let customerId = authIdentity.app_metadata?.customer_id as string | undefined

  if (!customerId) {
    // Reuse an existing Customer for this phone (other-provider login), else
    // create one. Query graph is used because the customer module's typed
    // filters don't expose `phone`.
    const query = scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id"],
      filters: { phone },
    })
    const existingCustomer = customers[0] as { id: string } | undefined

    if (existingCustomer) {
      customerId = existingCustomer.id
      authIdentity = await authService.updateAuthIdentities({
        id: authIdentity.id,
        app_metadata: {
          ...(authIdentity.app_metadata ?? {}),
          customer_id: customerId,
        },
      })
    } else {
      // Medusa customers require an email. When the shopper only gave a phone,
      // synthesize a stable, unique placeholder from the number (domain env-
      // tunable) so the account can be created.
      const emailDomain =
        process.env.PHONE_CUSTOMER_EMAIL_DOMAIN || "phone.happilee.local"
      const customerEmail =
        email || `${phone.replace(/[^\d]/g, "")}@${emailDomain}`

      const { result: customer } = await createCustomerAccountWorkflow(
        scope
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
  }

  const { http } = scope.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  ).projectConfig

  return generateJwtToken(
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
}
