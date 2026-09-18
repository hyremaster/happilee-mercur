import { ExecArgs, IFulfillmentModuleService } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  RuleOperator,
  ShippingOptionPriceType,
} from "@medusajs/framework/utils"
import {
  batchLinksWorkflow,
  createInventoryLevelsWorkflow,
  createServiceZonesWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { createSellerShippingOptionsWorkflow } from "@mercurjs/core/workflows"

/**
 * Backfill: complete the fulfillment + inventory chain for one seller so its
 * products can be added to a cart and checked out. Idempotent — only fills
 * what is missing:
 *
 *   1. seller locations <-> every enabled sales channel
 *   2. seller locations <-> manual fulfillment provider
 *   3. a country service zone on every location fulfillment set without one
 *   4. a flat 0 seller shipping option (enabled_in_store) on every empty zone
 *   5. an inventory level at the first seller location for every
 *      managed-inventory variant that has no level yet
 *
 *   bunx medusa exec ./src/scripts/setup-seller-fulfillment.ts <seller_id> [stocked_quantity=100] [country=in]
 */

const MANUAL_PROVIDER_ID = "manual_manual"

const OPTION_META: Record<
  string,
  { name: string; type: { label: string; description: string; code: string } }
> = {
  shipping: {
    name: "Standard Shipping",
    type: { label: "Standard", description: "Standard shipping", code: "standard" },
  },
  pickup: {
    name: "Pickup",
    type: { label: "Pickup", description: "Pickup at store", code: "pickup" },
  },
}

type LocationRow = {
  id: string
  fulfillment_sets?: {
    id: string
    type: string
    service_zones?: { id: string; shipping_options?: { id: string }[] }[]
  }[]
  fulfillment_providers?: { id: string }[]
}

export default async function setupSellerFulfillment({
  container,
  args,
}: ExecArgs) {
  const [sellerId, quantityArg, countryArg] = args
  if (!sellerId) {
    throw new Error("Usage: setup-seller-fulfillment.ts <seller_id> [stocked_quantity] [country]")
  }
  const stockedQuantity = Number(quantityArg ?? 100)
  const countryCode = (countryArg ?? "in").toLowerCase()

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModule = container.resolve<IFulfillmentModuleService>(
    Modules.FULFILLMENT
  )

  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: ["id", "name", "currency_code"],
    filters: { id: sellerId },
  })
  if (!seller) {
    throw new Error(`Seller ${sellerId} not found`)
  }
  console.log(`Seller: ${seller.name} (${seller.id})`)

  const { data: sellerLocs } = await query.graph({
    entity: "stock_location_seller",
    fields: ["stock_location_id"],
    filters: { seller_id: sellerId },
  })
  const locationIds = [
    ...new Set(
      (sellerLocs as { stock_location_id: string }[])
        .map((l) => l.stock_location_id)
        .filter(Boolean)
    ),
  ]
  if (!locationIds.length) {
    throw new Error("Seller has no stock locations")
  }

  // 1. Sales channels
  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
    filters: { is_disabled: false },
  })
  const channelIds = (channels as { id: string }[]).map((c) => c.id)
  for (const locationId of locationIds) {
    const { data: existing } = await query.graph({
      entity: "sales_channel_location",
      fields: ["sales_channel_id"],
      filters: { stock_location_id: locationId },
    })
    const have = new Set(
      (existing as { sales_channel_id: string }[]).map((e) => e.sales_channel_id)
    )
    const add = channelIds.filter((id) => !have.has(id))
    if (add.length) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: locationId, add },
      })
    }
    console.log(`  [sales channels] ${locationId}: +${add.length}`)
  }

  const [defaultProfile] = await fulfillmentModule.listShippingProfiles(
    { type: "default" },
    { take: 1 }
  )
  if (!defaultProfile) {
    throw new Error("No default shipping profile")
  }

  for (const locationId of locationIds) {
    const {
      data: [location],
    } = (await query.graph({
      entity: "stock_location",
      fields: [
        "id",
        "fulfillment_providers.id",
        "fulfillment_sets.id",
        "fulfillment_sets.type",
        "fulfillment_sets.service_zones.id",
        "fulfillment_sets.service_zones.shipping_options.id",
      ],
      filters: { id: locationId },
    })) as { data: LocationRow[] }

    // 2. Manual provider
    const hasProvider = (location.fulfillment_providers ?? []).some(
      (p) => p.id === MANUAL_PROVIDER_ID
    )
    if (!hasProvider) {
      await batchLinksWorkflow(container).run({
        input: {
          create: [
            {
              [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
              [Modules.FULFILLMENT]: {
                fulfillment_provider_id: MANUAL_PROVIDER_ID,
              },
            },
          ],
          delete: [],
        },
      })
    }
    console.log(`  [provider] ${locationId}: ${hasProvider ? "exists" : "linked"}`)

    for (const set of location.fulfillment_sets ?? []) {
      // 3. Service zone
      let zones = set.service_zones ?? []
      if (!zones.length) {
        const { result } = await createServiceZonesWorkflow(container).run({
          input: {
            data: [
              {
                fulfillment_set_id: set.id,
                name: `${set.type}-zone`,
                geo_zones: [{ type: "country", country_code: countryCode }],
              },
            ],
          },
        })
        zones = [{ id: result[0].id, shipping_options: [] }]
        console.log(`  [zone] ${set.id} (${set.type}): created ${result[0].id}`)
      }

      // 4. Shipping option
      const meta = OPTION_META[set.type] ?? OPTION_META.shipping
      for (const zone of zones) {
        if (zone.shipping_options?.length) {
          console.log(`  [option] ${zone.id}: exists`)
          continue
        }
        const { result } = await createSellerShippingOptionsWorkflow(
          container
        ).run({
          input: {
            seller_id: sellerId,
            shipping_options: [
              {
                name: meta.name,
                service_zone_id: zone.id,
                shipping_profile_id: defaultProfile.id,
                provider_id: MANUAL_PROVIDER_ID,
                price_type: ShippingOptionPriceType.FLAT,
                type: meta.type,
                prices: [{ currency_code: seller.currency_code, amount: 0 }],
                rules: [
                  {
                    attribute: "enabled_in_store",
                    operator: RuleOperator.EQ,
                    value: "true",
                  },
                ],
              },
            ],
          },
        })
        console.log(`  [option] ${zone.id}: created ${result[0].id}`)
      }
    }
  }

  // 5. Inventory levels
  const { data: products } = await query.graph({
    entity: "product_seller",
    fields: [
      "product.variants.manage_inventory",
      "product.variants.inventory_items.inventory_item_id",
      "product.variants.inventory_items.inventory.location_levels.location_id",
    ],
    filters: { seller_id: sellerId },
  })
  type VariantRow = {
    manage_inventory: boolean
    inventory_items?: {
      inventory_item_id: string
      inventory?: { location_levels?: { location_id: string }[] }
    }[]
  }
  const targetLocation = locationIds[0]
  const levels: {
    inventory_item_id: string
    location_id: string
    stocked_quantity: number
  }[] = []
  for (const row of products as { product?: { variants?: VariantRow[] } }[]) {
    for (const variant of row.product?.variants ?? []) {
      if (!variant.manage_inventory) {
        continue
      }
      for (const item of variant.inventory_items ?? []) {
        const hasLevel = (item.inventory?.location_levels ?? []).some((l) =>
          locationIds.includes(l.location_id)
        )
        if (!hasLevel) {
          levels.push({
            inventory_item_id: item.inventory_item_id,
            location_id: targetLocation,
            stocked_quantity: stockedQuantity,
          })
        }
      }
    }
  }
  if (levels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: levels },
    })
  }
  console.log(
    `  [inventory] created ${levels.length} level(s) at ${targetLocation} (qty ${stockedQuantity})`
  )

  console.log("DONE")
}
