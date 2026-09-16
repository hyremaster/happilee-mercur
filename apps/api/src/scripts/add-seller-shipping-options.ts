import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"
import { MercurModules } from "@mercurjs/types"

/**
 * One-off: give seller sel_01KZB0GE... shipping options on its two empty
 * service zones so /store/shipping-options returns rates. The seller had
 * fulfillment sets + service zones but zero shipping options.
 *
 *   bunx medusa exec ./src/scripts/add-seller-shipping-options.ts
 */
export default async function add({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK)

  const sellerId = "sel_01KZB0GE2GE36F2GYV3SC6RP8N"
  const shippingProfileId = "sp_01M1GSWHYQP81F43750S1E2TZN"
  const providerId = "manual_manual"

  const deliveryZone = "serzo_01M1GSV816D1HK7BMB4QVCKN0Y" // standard-delviery
  const pickupZone = "serzo_01M1GSTMWHCGBFE8WKWAFYAK5K" // pick-up

  // Skip zones that already have an option (idempotent).
  const { data: zones } = await query.graph({
    entity: "service_zone",
    filters: { id: [deliveryZone, pickupZone] },
    fields: ["id", "shipping_options.id"],
  })
  const hasOption = new Set(
    (zones as any[])
      .filter((z) => (z.shipping_options?.length ?? 0) > 0)
      .map((z) => z.id)
  )

  const inputs = [
    {
      name: "Standard Delivery",
      service_zone_id: deliveryZone,
      shipping_profile_id: shippingProfileId,
      provider_id: providerId,
      price_type: "flat" as const,
      type: {
        label: "Standard",
        code: "standard",
        description: "3-5 business days",
      },
      prices: [{ currency_code: "inr", amount: 50 }],
      rules: [],
    },
    {
      name: "Store Pickup",
      service_zone_id: pickupZone,
      shipping_profile_id: shippingProfileId,
      provider_id: providerId,
      price_type: "flat" as const,
      type: {
        label: "Pickup",
        code: "pickup",
        description: "Collect from store",
      },
      prices: [{ currency_code: "inr", amount: 0 }],
      rules: [],
    },
  ].filter((i) => !hasOption.has(i.service_zone_id))

  if (!inputs.length) {
    console.log("Both zones already have options; nothing to do.")
    return
  }

  const { result } = await createShippingOptionsWorkflow(container).run({
    input: inputs,
  })

  const optionIds = result.map((o: any) => o.id)
  console.log("Created shipping options:", optionIds)

  await remoteLink.create(
    optionIds.map((id) => ({
      [Modules.FULFILLMENT]: { shipping_option_id: id },
      [MercurModules.SELLER]: { seller_id: sellerId },
    }))
  )
  console.log("Linked options to seller", sellerId)
  console.log("DONE")
}
