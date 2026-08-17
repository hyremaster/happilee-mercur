import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  batchLinksWorkflow,
  createLocationFulfillmentSetWorkflow,
  createServiceZonesWorkflow,
  createShippingProfilesWorkflow,
  deleteFulfillmentSetsWorkflow,
  deleteShippingOptionsWorkflow,
} from "@medusajs/core-flows"
import {
  ContainerRegistrationKeys,
  Modules,
  RuleOperator,
  ShippingOptionPriceType,
} from "@medusajs/framework/utils"
import type { IFulfillmentModuleService } from "@medusajs/framework/types"
import { StoreFulfillmentMethod } from "@mercurjs/types"

import { createSellerShippingOptionsWorkflow } from "../../shipping-option"

/**
 * Auto-provision a store's fulfillment on onboarding submit. Onboarding collects
 * a commerce type + fulfillment methods but no shipping infrastructure; a live
 * store still needs Medusa shipping options for checkout. This step materializes
 * the minimum viable setup per fulfillment centre (stock location):
 *
 *   fulfillment_methods -> fulfillment-set kinds
 *     delivery | shipping  -> "shipping" set   (both are couriered handoff)
 *     pickup               -> "pickup" set     (customer collects, as-is)
 *
 * For each kind, per location, it builds the full Medusa chain a shipping option
 * requires: fulfillment set -> service zone (country geo) -> manual provider
 * link -> flat 0 shipping option (seller-linked) carrying the mandatory
 * `enabled_in_store` rule so the option is visible to the storefront cart. Price
 * is 0 (free) until the vendor edits it in shipping settings.
 *
 * Not idempotent by design: submit always targets a freshly-created seller +
 * freshly-created locations, so there is nothing pre-existing to reconcile.
 * Compensation deletes the shipping options and fulfillment sets it created.
 */

const MANUAL_PROVIDER_ID = "manual_manual"

type FulfillmentKind = "shipping" | "pickup"

const OPTION_META: Record<
  FulfillmentKind,
  { name: string; type: { label: string; description: string; code: string } }
> = {
  shipping: {
    name: "Standard Shipping",
    type: {
      label: "Standard",
      description: "Standard shipping",
      code: "standard",
    },
  },
  pickup: {
    name: "Pickup",
    type: {
      label: "Pickup",
      description: "Pickup at store",
      code: "pickup",
    },
  },
}

export type CreateStoreFulfillmentOptionsInput = {
  seller_id: string
  currency_code: string
  country_code?: string | null
  fulfillment_methods?: string[] | null
  location_ids: string[]
}

type CreateStoreFulfillmentOptionsRollback = {
  fulfillment_set_ids: string[]
  shipping_option_ids: string[]
}

/**
 * Collapse the onboarding fulfillment methods into the distinct fulfillment-set
 * kinds we create. Delivery and shipping both become a single "shipping" set.
 */
function resolveKinds(methods?: string[] | null): FulfillmentKind[] {
  const selected = new Set(methods ?? [])
  const kinds: FulfillmentKind[] = []
  if (
    selected.has(StoreFulfillmentMethod.DELIVERY) ||
    selected.has(StoreFulfillmentMethod.SHIPPING)
  ) {
    kinds.push("shipping")
  }
  if (selected.has(StoreFulfillmentMethod.PICKUP)) {
    kinds.push("pickup")
  }
  return kinds
}

export const createStoreFulfillmentOptionsStep = createStep(
  "create-store-fulfillment-options",
  async (
    input: CreateStoreFulfillmentOptionsInput,
    { container }
  ): Promise<
    StepResponse<
      CreateStoreFulfillmentOptionsRollback,
      CreateStoreFulfillmentOptionsRollback
    >
  > => {
    const empty: CreateStoreFulfillmentOptionsRollback = {
      fulfillment_set_ids: [],
      shipping_option_ids: [],
    }

    const kinds = resolveKinds(input.fulfillment_methods)
    if (!kinds.length || !input.location_ids.length) {
      return new StepResponse(empty, empty)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const fulfillmentModule = container.resolve<IFulfillmentModuleService>(
      Modules.FULFILLMENT
    )

    // Service zones need a geo match against the cart address or the option is
    // hidden. Cover the store's country: prefer the onboarding address country,
    // fall back to the default region's country, finally to "in".
    let countryCode = input.country_code?.trim().toLowerCase() || null
    if (!countryCode) {
      const { data: regions } = await query.graph({
        entity: "region",
        fields: ["countries.iso_2"],
        pagination: { take: 1 },
      })
      const region = regions[0] as
        | { countries?: { iso_2: string }[] }
        | undefined
      countryCode = region?.countries?.[0]?.iso_2 ?? "in"
    }

    // Reuse the global default shipping profile; seed one if the project has none.
    const [existingProfile] = await fulfillmentModule.listShippingProfiles(
      { type: "default" },
      { take: 1 }
    )
    let shippingProfileId = existingProfile?.id
    if (!shippingProfileId) {
      const { result } = await createShippingProfilesWorkflow(container).run({
        input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
      })
      shippingProfileId = result[0].id
    }

    const createdSetIds: string[] = []
    const createdOptionIds: string[] = []

    for (const locationId of input.location_ids) {
      // Manual fulfillment provider, linked once per location.
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

      for (const kind of kinds) {
        await createLocationFulfillmentSetWorkflow(container).run({
          input: {
            location_id: locationId,
            fulfillment_set_data: { name: kind, type: kind },
          },
        })

        // The create-set workflow returns the location; re-read to pick the set
        // it just added (the one of this kind we have not yet consumed).
        const { data: locations } = await query.graph({
          entity: "stock_location",
          fields: [
            "fulfillment_sets.id",
            "fulfillment_sets.type",
          ],
          filters: { id: locationId },
        })
        const location = locations[0] as
          | { fulfillment_sets?: { id: string; type: string }[] }
          | undefined
        const set = (location?.fulfillment_sets ?? []).find(
          (fs) => fs.type === kind && !createdSetIds.includes(fs.id)
        )
        if (!set) {
          continue
        }
        createdSetIds.push(set.id)

        const { result: zones } = await createServiceZonesWorkflow(
          container
        ).run({
          input: {
            data: [
              {
                fulfillment_set_id: set.id,
                name: `${kind}-zone`,
                geo_zones: [{ type: "country", country_code: countryCode }],
              },
            ],
          },
        })
        const zoneId = zones[0].id

        const meta = OPTION_META[kind]
        const { result: options } = await createSellerShippingOptionsWorkflow(
          container
        ).run({
          input: {
            seller_id: input.seller_id,
            shipping_options: [
              {
                name: meta.name,
                service_zone_id: zoneId,
                shipping_profile_id: shippingProfileId,
                provider_id: MANUAL_PROVIDER_ID,
                price_type: ShippingOptionPriceType.FLAT,
                type: meta.type,
                prices: [{ currency_code: input.currency_code, amount: 0 }],
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
        createdOptionIds.push(options[0].id)
      }
    }

    const created: CreateStoreFulfillmentOptionsRollback = {
      fulfillment_set_ids: createdSetIds,
      shipping_option_ids: createdOptionIds,
    }
    return new StepResponse(created, created)
  },
  async (rollback, { container }) => {
    if (!rollback) {
      return
    }
    if (rollback.shipping_option_ids.length) {
      await deleteShippingOptionsWorkflow(container).run({
        input: { ids: rollback.shipping_option_ids },
      })
    }
    if (rollback.fulfillment_set_ids.length) {
      await deleteFulfillmentSetsWorkflow(container).run({
        input: { ids: rollback.fulfillment_set_ids },
      })
    }
  }
)
