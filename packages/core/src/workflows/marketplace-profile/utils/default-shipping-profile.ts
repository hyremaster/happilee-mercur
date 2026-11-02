import { IFulfillmentModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Checkout rejects a cart whose shippable items carry no shipping profile
 * matching the chosen shipping option, and the vendor UI never sends one. Default
 * to the profile the seller's own shipping options use (created at onboarding),
 * falling back to the project's default profile.
 */
export async function resolveDefaultShippingProfileId(
  scope: MedusaContainer,
  sellerId: string
): Promise<string | undefined> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["shipping_options.shipping_profile_id"],
    filters: { id: sellerId },
  })

  const options =
    (sellers[0] as
      | { shipping_options?: ({ shipping_profile_id?: string | null } | null)[] }
      | undefined)?.shipping_options ?? []
  const fromOptions = options.find((o) => o?.shipping_profile_id)
    ?.shipping_profile_id
  if (fromOptions) {
    return fromOptions
  }

  const fulfillmentModule = scope.resolve<IFulfillmentModuleService>(
    Modules.FULFILLMENT
  )
  const [defaultProfile] = await fulfillmentModule.listShippingProfiles(
    { type: "default" },
    { take: 1 }
  )
  return defaultProfile?.id
}
