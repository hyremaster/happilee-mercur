import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Backfill: link seller stock locations to all sales channels so their
 * shipping options surface in the storefront. Seller onboarding creates the
 * location + seller link but NOT the sales_channel <-> location link, which the
 * /store/shipping-options flow requires.
 *
 *   bunx medusa exec ./src/scripts/link-seller-location-sc.ts            # all sellers
 *   bunx medusa exec ./src/scripts/link-seller-location-sc.ts <loc_id>   # one location
 */
export default async function link({ container, args }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "is_disabled"],
  })
  const channelIds = channels
    .filter((c: any) => !c.is_disabled)
    .map((c: any) => c.id)
  if (!channelIds.length) {
    console.log("No enabled sales channels; nothing to link.")
    return
  }

  // Which seller locations to process.
  const only = args[0]
  const { data: sellerLocs } = await query.graph({
    entity: "stock_location_seller",
    fields: ["stock_location_id"],
    ...(only ? { filters: { stock_location_id: only } } : {}),
  })
  const locationIds = [
    ...new Set(sellerLocs.map((l: any) => l.stock_location_id).filter(Boolean)),
  ] as string[]

  console.log(`Linking ${locationIds.length} seller location(s) to ${channelIds.length} channel(s).`)

  for (const locationId of locationIds) {
    // Which channels is this location already linked to? Only add missing ones.
    const { data: existing } = await query.graph({
      entity: "sales_channel_location",
      fields: ["sales_channel_id"],
      filters: { stock_location_id: locationId },
    })
    const have = new Set(existing.map((e: any) => e.sales_channel_id))
    const add = channelIds.filter((id) => !have.has(id))
    if (!add.length) {
      console.log(`  ${locationId}: already linked, skip`)
      continue
    }
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: locationId, add },
    })
    console.log(`  ${locationId}: linked +${add.length} channel(s)`)
  }

  console.log("DONE")
}
