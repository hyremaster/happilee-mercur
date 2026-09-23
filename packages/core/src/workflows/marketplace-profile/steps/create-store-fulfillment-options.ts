import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  batchLinksWorkflow,
  createLocationFulfillmentSetWorkflow,
  createServiceZonesWorkflow,
  createShippingProfilesWorkflow,
  deleteFulfillmentSetsWorkflow,
  deleteServiceZonesWorkflow,
  deleteShippingOptionsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/core-flows"
import {
  ContainerRegistrationKeys,
  Modules,
  RuleOperator,
  ShippingOptionPriceType,
} from "@medusajs/framework/utils"
import type {
  IFulfillmentModuleService,
  UpdateShippingOptionDTO,
} from "@medusajs/framework/types"
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
 * Every location is also linked to all enabled sales channels, independent of
 * fulfillment methods: cart inventory checks resolve stock through the
 * sales_channel <-> location link, so without it any managed-inventory variant
 * fails with "Sales channel ... is not associated with any stock location".
 *
 * Kinds the store no longer offers are hidden from checkout, not deleted
 * (carts may still reference them): their options' `enabled_in_store` rule is
 * set to "false" and the option is marked `metadata.hidden_by_fulfillment_methods`.
 * Turning the kind back on re-shows only options carrying that marker, so an
 * option the vendor hid themselves stays hidden.
 *
 * Idempotent: every piece is created only when missing (sales-channel links,
 * provider link, and per kind the fulfillment set, service zone and shipping
 * option), so it runs both on onboarding submit and whenever the store's
 * fulfillment methods are edited later. Existing vendor-configured sets, zones
 * and options are left untouched. Compensation removes only what this run
 * created.
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
  service_zone_ids: string[]
  shipping_option_ids: string[]
  sales_channel_links: { location_id: string; sales_channel_ids: string[] }[]
  visibility_changes: VisibilityChange[]
}

type ShippingOptionRuleRow = {
  id: string
  attribute: string
  operator: string
  value: unknown
}

type VisibilityChange = {
  shipping_option_id: string
  previous_metadata: Record<string, unknown> | null
  // Rule that existed and had its value changed…
  rule?: { id: string; attribute: string; operator: string; previous_value: unknown }
  // …or a rule this run had to create.
  created_rule_id?: string
}

const HIDDEN_MARKER = "hidden_by_fulfillment_methods"
const ALL_KINDS: FulfillmentKind[] = ["shipping", "pickup"]

type LocationFulfillmentRow = {
  id: string
  fulfillment_providers?: ({ id: string } | null)[] | null
  fulfillment_sets?:
    | ({
        id: string
        type: string
        service_zones?:
          | ({
              id: string
              shipping_options?:
                | ({
                    id: string
                    metadata?: Record<string, unknown> | null
                    rules?: (ShippingOptionRuleRow | null)[] | null
                  } | null)[]
                | null
            } | null)[]
          | null
      } | null)[]
    | null
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

/**
 * `shipping_option.metadata` exists on the model but is missing from Medusa's
 * update DTO type; widen the payload instead of dropping type safety.
 */
async function setShippingOptionMetadata(
  fulfillmentModule: IFulfillmentModuleService,
  id: string,
  metadata: Record<string, unknown> | null
) {
  const update: UpdateShippingOptionDTO & {
    metadata: Record<string, unknown> | null
  } = { metadata }
  await fulfillmentModule.updateShippingOptions(id, update)
}

/**
 * Show or hide one option in the storefront via its `enabled_in_store` rule.
 * Hiding marks the option so only options hidden here are ever re-shown.
 * Returns what changed (for compensation), or null when nothing did.
 */
async function syncOptionVisibility(
  fulfillmentModule: IFulfillmentModuleService,
  option: {
    id: string
    metadata?: Record<string, unknown> | null
    rules?: (ShippingOptionRuleRow | null)[] | null
  },
  offered: boolean
): Promise<VisibilityChange | null> {
  const metadata = option.metadata ?? null
  const hiddenByUs = metadata?.[HIDDEN_MARKER] === true
  const rule = (option.rules ?? []).find(
    (r): r is ShippingOptionRuleRow => r?.attribute === "enabled_in_store"
  )
  const visible = !rule || String(rule.value) === "true"

  if (!offered && visible) {
    const change: VisibilityChange = {
      shipping_option_id: option.id,
      previous_metadata: metadata,
    }
    if (rule) {
      await fulfillmentModule.updateShippingOptionRules({
        id: rule.id,
        attribute: rule.attribute,
        operator: rule.operator as RuleOperator,
        value: "false",
      })
      change.rule = {
        id: rule.id,
        attribute: rule.attribute,
        operator: rule.operator,
        previous_value: rule.value,
      }
    } else {
      const [createdRule] = await fulfillmentModule.createShippingOptionRules([
        {
          shipping_option_id: option.id,
          attribute: "enabled_in_store",
          operator: RuleOperator.EQ,
          value: "false",
        },
      ])
      change.created_rule_id = createdRule.id
    }
    await setShippingOptionMetadata(fulfillmentModule, option.id, {
      ...(metadata ?? {}),
      [HIDDEN_MARKER]: true,
    })
    return change
  }

  if (offered && hiddenByUs) {
    const change: VisibilityChange = {
      shipping_option_id: option.id,
      previous_metadata: metadata,
    }
    if (rule) {
      await fulfillmentModule.updateShippingOptionRules({
        id: rule.id,
        attribute: rule.attribute,
        operator: rule.operator as RuleOperator,
        value: "true",
      })
      change.rule = {
        id: rule.id,
        attribute: rule.attribute,
        operator: rule.operator,
        previous_value: rule.value,
      }
    }
    const { [HIDDEN_MARKER]: _marker, ...rest } = metadata ?? {}
    await setShippingOptionMetadata(fulfillmentModule, option.id, rest)
    return change
  }

  return null
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
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const created: CreateStoreFulfillmentOptionsRollback = {
      fulfillment_set_ids: [],
      service_zone_ids: [],
      shipping_option_ids: [],
      sales_channel_links: [],
      visibility_changes: [],
    }

    if (!input.location_ids.length) {
      return new StepResponse(created, created)
    }

    // Sales channels: add only the links a location is missing.
    const { data: channels } = await query.graph({
      entity: "sales_channel",
      fields: ["id"],
      filters: { is_disabled: false },
    })
    const salesChannelIds = (channels as { id: string }[]).map((c) => c.id)
    for (const locationId of input.location_ids) {
      if (!salesChannelIds.length) {
        break
      }
      const { data: existingLinks } = await query.graph({
        entity: "sales_channel_location",
        fields: ["sales_channel_id"],
        filters: { stock_location_id: locationId },
      })
      const linked = new Set(
        (existingLinks as { sales_channel_id: string }[]).map(
          (l) => l.sales_channel_id
        )
      )
      const add = salesChannelIds.filter((id) => !linked.has(id))
      if (!add.length) {
        continue
      }
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: locationId, add },
      })
      created.sales_channel_links.push({
        location_id: locationId,
        sales_channel_ids: add,
      })
    }

    const kinds = resolveKinds(input.fulfillment_methods)

    const fulfillmentModule = container.resolve<IFulfillmentModuleService>(
      Modules.FULFILLMENT
    )

    // Service zones need a geo match against the cart address or the option is
    // hidden. Cover the store's country: prefer the store address country,
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

    const readLocation = async (
      locationId: string
    ): Promise<LocationFulfillmentRow | undefined> => {
      const { data } = await query.graph({
        entity: "stock_location",
        fields: [
          "id",
          "fulfillment_providers.id",
          "fulfillment_sets.id",
          "fulfillment_sets.type",
          "fulfillment_sets.service_zones.id",
          "fulfillment_sets.service_zones.shipping_options.id",
          "fulfillment_sets.service_zones.shipping_options.metadata",
          "fulfillment_sets.service_zones.shipping_options.rules.id",
          "fulfillment_sets.service_zones.shipping_options.rules.attribute",
          "fulfillment_sets.service_zones.shipping_options.rules.operator",
          "fulfillment_sets.service_zones.shipping_options.rules.value",
        ],
        filters: { id: locationId },
      })
      return data[0] as LocationFulfillmentRow | undefined
    }

    for (const locationId of input.location_ids) {
      let location = await readLocation(locationId)

      // Manual fulfillment provider, linked once per location.
      const hasProvider = (location?.fulfillment_providers ?? []).some(
        (p) => p?.id === MANUAL_PROVIDER_ID
      )
      if (kinds.length && !hasProvider) {
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

      for (const kind of kinds) {
        let set = (location?.fulfillment_sets ?? []).find(
          (fs) => fs?.type === kind
        )

        if (!set) {
          await createLocationFulfillmentSetWorkflow(container).run({
            input: {
              location_id: locationId,
              // Set names are unique across the whole project, so qualify
              // them by location (a bare "shipping" collides on the second
              // location or store).
              fulfillment_set_data: { name: `${kind}-${locationId}`, type: kind },
            },
          })
          location = await readLocation(locationId)
          set = (location?.fulfillment_sets ?? []).find(
            (fs) => fs?.type === kind
          )
          if (!set) {
            continue
          }
          created.fulfillment_set_ids.push(set.id)
        }

        const zones = (set.service_zones ?? []).filter(
          (z): z is NonNullable<typeof z> => !!z
        )

        // A zone that already offers an option means this kind is served.
        if (zones.some((z) => (z.shipping_options ?? []).some((o) => !!o))) {
          continue
        }

        let zoneId = zones[0]?.id
        if (!zoneId) {
          const { result: newZones } = await createServiceZonesWorkflow(
            container
          ).run({
            input: {
              data: [
                {
                  fulfillment_set_id: set.id,
                  // Zone names are project-unique too.
                  name: `${kind}-zone-${locationId}`,
                  geo_zones: [{ type: "country", country_code: countryCode }],
                },
              ],
            },
          })
          zoneId = newZones[0].id
          created.service_zone_ids.push(zoneId)
        }

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
        created.shipping_option_ids.push(options[0].id)
      }

      // Visibility: hide options of kinds no longer offered, re-show the ones
      // this sync hid earlier for kinds offered again.
      location = await readLocation(locationId)
      for (const set of location?.fulfillment_sets ?? []) {
        if (!set || !ALL_KINDS.includes(set.type as FulfillmentKind)) {
          continue
        }
        const offered = kinds.includes(set.type as FulfillmentKind)
        for (const zone of set.service_zones ?? []) {
          for (const option of zone?.shipping_options ?? []) {
            if (!option) {
              continue
            }
            const change = await syncOptionVisibility(
              fulfillmentModule,
              option,
              offered
            )
            if (change) {
              created.visibility_changes.push(change)
            }
          }
        }
      }
    }

    return new StepResponse(created, created)
  },
  async (rollback, { container }) => {
    if (!rollback) {
      return
    }
    const fulfillmentModule = container.resolve<IFulfillmentModuleService>(
      Modules.FULFILLMENT
    )
    for (const change of rollback.visibility_changes ?? []) {
      if (change.created_rule_id) {
        await fulfillmentModule.deleteShippingOptionRules([change.created_rule_id])
      }
      if (change.rule) {
        await fulfillmentModule.updateShippingOptionRules({
          id: change.rule.id,
          attribute: change.rule.attribute,
          operator: change.rule.operator as RuleOperator,
          value: change.rule.previous_value as string,
        })
      }
      await setShippingOptionMetadata(
        fulfillmentModule,
        change.shipping_option_id,
        change.previous_metadata
      )
    }
    if (rollback.shipping_option_ids.length) {
      await deleteShippingOptionsWorkflow(container).run({
        input: { ids: rollback.shipping_option_ids },
      })
    }
    if (rollback.service_zone_ids?.length) {
      await deleteServiceZonesWorkflow(container).run({
        input: { ids: rollback.service_zone_ids },
      })
    }
    if (rollback.fulfillment_set_ids.length) {
      await deleteFulfillmentSetsWorkflow(container).run({
        input: { ids: rollback.fulfillment_set_ids },
      })
    }
    for (const link of rollback.sales_channel_links ?? []) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: link.location_id, remove: link.sales_channel_ids },
      })
    }
  }
)
