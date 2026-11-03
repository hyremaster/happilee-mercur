import {
  batchPriceListPricesWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/core-flows"
import { CreatePriceListWorkflowInputDTO, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  PriceListStatus,
  PriceListType,
} from "@medusajs/framework/utils"

import type IntegrationModuleService from "../../../modules/integration/service"
import { toSyncRunLogMessage } from "../../../modules/integration/utils/integration-error"
import {
  computeItemPrice,
  PriceHoldReason,
  PriceItem,
  SyncedPrices,
} from "../../../modules/integration/utils/price-staging"
import { createSellerPriceListsWorkflow } from "../../price-list/workflows/create-seller-price-lists"

type Scope = { seller_id: string; provider_id: string }

export type PriceProjectionCounts = { priced: number; held: number; prices_failed: number }

export type PriceTarget = { price_list_id: string; currency_code: string }

/** A variant to change in Medusa. No prices means remove them. */
type PriceWrite = { item: PriceItem; prices: SyncedPrices | null; reason: PriceHoldReason | null }

/**
 * The store's sale price list for this provider and its currency. If someone
 * deleted the list, a new one is made and every price is written again.
 */
export async function resolvePriceTarget(
  container: MedusaContainer,
  service: IntegrationModuleService,
  scope: Scope
): Promise<PriceTarget> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["currency_code"],
    filters: { id: scope.seller_id },
  })
  const currencyCode = (sellers[0] as { currency_code: string }).currency_code.toLowerCase()

  const connection = await service.retrieveSellerIntegration(scope.seller_id, scope.provider_id)
  const existingId = connection?.price_list_id
  if (existingId) {
    const lists = await container.resolve(Modules.PRICING).listPriceLists({ id: [existingId] })
    if (lists.length) {
      return { price_list_id: existingId, currency_code: currencyCode }
    }
  }

  // The workflow passes `type` on to the pricing module; its input type omits it.
  const priceList: CreatePriceListWorkflowInputDTO & { type: PriceListType } = {
    title: `Synced selling prices (${scope.provider_id})`,
    description: "Selling prices from the catalogue sync. Changes here are overwritten.",
    type: PriceListType.SALE,
    status: PriceListStatus.ACTIVE,
    prices: [],
  }
  const { result } = await createSellerPriceListsWorkflow(container).run({
    input: { seller_id: scope.seller_id, price_lists_data: [priceList] },
  })
  await service.savePriceList(scope, result[0].id)
  return { price_list_id: result[0].id, currency_code: currencyCode }
}

const samePrices = (a: SyncedPrices | null, b: SyncedPrices | null) =>
  a?.mrp === b?.mrp && a?.price === b?.price

/**
 * Applies one page of prices to Medusa: the variant's base price is the MRP and
 * the sale price list holds the selling price, so Medusa returns the MRP as the
 * original price. Writes only what changed. An item with bad data loses its
 * prices, so it can't be sold at a stale one. With no stock anywhere it keeps
 * its last price. A failing item is retried on the next run.
 */
export async function projectPricesPage(
  container: MedusaContainer,
  service: IntegrationModuleService,
  scope: Scope,
  target: PriceTarget,
  items: PriceItem[]
): Promise<PriceProjectionCounts> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const counts: PriceProjectionCounts = { priced: 0, held: 0, prices_failed: 0 }
  const writes: PriceWrite[] = []
  const unchanged: Parameters<IntegrationModuleService["recordItemPrices"]>[1] = []

  for (const item of items) {
    const result = computeItemPrice(item.offers)
    if (result.kind === "no_stock") {
      if (item.price_hold_reason) {
        unchanged.push({ external_id: item.external_id, synced_prices: null, price_hold_reason: null })
      }
    } else if (result.kind === "held") {
      if (item.synced_prices) {
        writes.push({ item, prices: null, reason: result.reason })
      } else if (item.price_hold_reason !== result.reason) {
        unchanged.push({
          external_id: item.external_id,
          synced_prices: null,
          price_hold_reason: result.reason,
        })
        counts.held++
      }
    } else if (!samePrices(item.synced_prices, result.prices) || item.price_hold_reason) {
      writes.push({ item, prices: result.prices, reason: null })
    }
  }
  await service.recordItemPrices(scope, unchanged)

  const apply = async (entries: PriceWrite[]) => {
    await writePrices(container, target, entries)
    await service.recordItemPrices(
      scope,
      entries.map((entry) => ({
        external_id: entry.item.external_id,
        synced_prices: entry.prices,
        price_hold_reason: entry.reason,
      }))
    )
    for (const entry of entries) {
      if (entry.prices) {
        counts.priced++
      } else {
        counts.held++
      }
    }
  }

  if (writes.length) {
    try {
      await apply(writes)
    } catch {
      // One at a time, so only the bad item fails.
      for (const entry of writes) {
        try {
          await apply([entry])
        } catch (e) {
          counts.prices_failed++
          logger.error(
            `Price projection failed for item ${entry.item.external_id} of store ${scope.seller_id} / ${scope.provider_id}: ${toSyncRunLogMessage(e)}`
          )
        }
      }
    }
  }
  return counts
}

async function writePrices(
  container: MedusaContainer,
  target: PriceTarget,
  entries: PriceWrite[]
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricing = container.resolve(Modules.PRICING)
  const variantIds = entries.map((entry) => entry.item.variant_id)

  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "price_set.id"],
    filters: { id: variantIds },
  })
  const variantByPriceSet = new Map(
    (variants as unknown as { id: string; price_set?: { id: string } | null }[])
      .filter((variant) => !!variant.price_set)
      .map((variant) => [variant.price_set?.id as string, variant.id])
  )
  const existing = variantByPriceSet.size
    ? await pricing.listPrices({
        price_list_id: [target.price_list_id],
        price_set_id: [...variantByPriceSet.keys()],
      })
    : []
  const listPriceByVariant = new Map(
    existing.map((price) => [variantByPriceSet.get(price.price_set_id as string), price.id])
  )

  const create: { variant_id: string; currency_code: string; amount: number }[] = []
  const update: { id: string; variant_id: string; currency_code: string; amount: number }[] = []
  const remove: string[] = []
  for (const { item, prices } of entries) {
    const listPriceId = listPriceByVariant.get(item.variant_id)
    if (!prices) {
      if (listPriceId) {
        remove.push(listPriceId)
      }
    } else if (listPriceId) {
      update.push({
        id: listPriceId,
        variant_id: item.variant_id,
        currency_code: target.currency_code,
        amount: prices.price,
      })
    } else {
      create.push({
        variant_id: item.variant_id,
        currency_code: target.currency_code,
        amount: prices.price,
      })
    }
  }

  await batchPriceListPricesWorkflow(container).run({
    input: { data: { id: target.price_list_id, create, update, delete: remove } },
  })
  await updateProductVariantsWorkflow(container).run({
    input: {
      product_variants: entries.map(({ item, prices }) => ({
        id: item.variant_id,
        prices: prices ? [{ currency_code: target.currency_code, amount: prices.mrp }] : [],
      })),
    },
  })
}
