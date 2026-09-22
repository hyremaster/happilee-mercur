import { MedusaRequest } from "@medusajs/framework/http"
import { IAuthModuleService } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/core-flows"
import { MercurModules } from "@mercurjs/types"

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
  /**
   * Store this login belongs to (from `req.store_seller_context`). When set,
   * the account is scoped to that store: identity, customer and session all
   * carry it. Omitted while a storefront still sends no store header, which
   * keeps the previous marketplace-wide account.
   */
  seller?: { seller_id: string; handle: string }
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
  { phone, provider, first_name, last_name, email, seller }: MintPhoneSessionInput
): Promise<string> {
  const authService = scope.resolve<IAuthModuleService>(Modules.AUTH)

  // One identity per phone PER STORE, so signing in at one store never hands
  // back another store's account.
  const entityId = seller ? `${phone}:${seller.seller_id}` : phone

  const existing = await authService.listAuthIdentities(
    { provider_identities: { entity_id: entityId, provider } },
    { relations: ["provider_identities"] }
  )

  let authIdentity =
    existing[0] ??
    (await authService.createAuthIdentities({
      provider_identities: [{ provider, entity_id: entityId }],
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
    let candidates = customers as { id: string }[]

    // Within a store the two phone channels still share one account, but a
    // customer belonging to another store must never be reused: narrow the
    // candidates to those already linked to this store.
    if (seller && candidates.length) {
      const { data: links } = await query.graph({
        entity: "seller_customer",
        fields: ["customer_id"],
        filters: {
          seller_id: seller.seller_id,
          customer_id: candidates.map((c) => c.id),
        },
      })
      const linked = new Set(
        (links as { customer_id: string }[]).map((l) => l.customer_id)
      )
      candidates = candidates.filter((c) => linked.has(c.id))
    }

    const existingCustomer = candidates[0]

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
      const digits = phone.replace(/[^\d]/g, "")

      // Store accounts always get a synthesized login email qualified by the
      // store: (email, has_account) is unique, so a shopper's real address
      // could only ever belong to one store. The address they gave is kept as
      // a contact detail instead.
      const customerEmail = seller
        ? `${digits}.${seller.handle}@${emailDomain}`
        : email || `${digits}@${emailDomain}`

      const { result: customer } = await createCustomerAccountWorkflow(
        scope
      ).run({
        input: {
          authIdentityId: authIdentity.id,
          customerData: {
            phone,
            email: customerEmail,
            ...(seller
              ? {
                  metadata: {
                    seller_id: seller.seller_id,
                    ...(email ? { contact_email: email } : {}),
                  },
                }
              : {}),
            ...(first_name ? { first_name } : {}),
            ...(last_name ? { last_name } : {}),
          },
        },
      })
      customerId = customer.id
      authIdentity = await authService.retrieveAuthIdentity(authIdentity.id)
    }
  }

  // Membership is recorded at sign-in, not at first order, so a store sees the
  // shoppers who signed in there even before they buy anything.
  if (seller && customerId) {
    const query = scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: existingLinks } = await query.graph({
      entity: "seller_customer",
      fields: ["customer_id"],
      filters: { seller_id: seller.seller_id, customer_id: customerId },
    })

    if (!existingLinks.length) {
      const link = scope.resolve(ContainerRegistrationKeys.LINK)
      await link.create({
        [MercurModules.SELLER]: { seller_id: seller.seller_id },
        [Modules.CUSTOMER]: { customer_id: customerId },
      })
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
      app_metadata: {
        customer_id: customerId,
        // Phase 3 rejects this session on any other store's request.
        ...(seller ? { seller_id: seller.seller_id } : {}),
      },
      user_metadata: {},
    },
    {
      secret: http.jwtSecret,
      expiresIn: http.jwtExpiresIn,
      jwtOptions: http.jwtOptions,
    }
  )
}
