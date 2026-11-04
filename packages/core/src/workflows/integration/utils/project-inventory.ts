import {
  createInventoryLevelsWorkflow,
  updateInventoryLevelsWorkflow,
} from "@medusajs/core-flows"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import type IntegrationModuleService from "../../../modules/integration/service"
import { toSyncRunLogMessage } from "../../../modules/integration/utils/integration-error"
import type { StockChange } from "../../../modules/integration/utils/inventory-staging"

type Scope = { seller_id: string; provider_id: string }

export type InventoryProjectionCounts = { created: number; updated: number; failed: number }

const levelKey = (inventoryItemId: string, locationId: string) => `${inventoryItemId}:${locationId}`

/** A store setting; anything that isn't a positive number means no buffer. */
export const toDefaultBuffer = (value: unknown): number => {
  const buffer = Number(value)
  return Number.isFinite(buffer) && buffer > 0 ? buffer : 0
}

/**
 * Writes provider stock to Medusa inventory levels: the sync owns
 * `stocked_quantity`, and reservations are never touched.
 *
 * This can only under-count. An order reserves stock here while the provider
 * still counts it, until it's billed there, so availability is stock − reserved
 * until the next sync brings the lower stock. Cancelling releases the reservation.
 */
export async function projectInventoryPage(
  container: MedusaContainer,
  service: IntegrationModuleService,
  scope: Scope,
  changes: StockChange[]
): Promise<InventoryProjectionCounts> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const counts: InventoryProjectionCounts = { created: 0, updated: 0, failed: 0 }

  const apply = async (entries: StockChange[]) => {
    const written = await writeLevels(container, entries)
    await service.recordAppliedStock(
      scope,
      entries.map((entry) => ({
        id: entry.id,
        synced_stock: entry.target_location_id ? entry.available : null,
        synced_stock_location_id: entry.target_location_id,
      }))
    )
    counts.created += written.created
    counts.updated += written.updated
  }

  try {
    await apply(changes)
  } catch {
    // One at a time, so only the bad row fails; it's retried on the next run.
    for (const entry of changes) {
      try {
        await apply([entry])
      } catch (e) {
        counts.failed++
        logger.error(
          `Inventory sync failed for item ${entry.item_external_id} of store ${scope.seller_id} / ${scope.provider_id}: ${toSyncRunLogMessage(e)}`
        )
      }
    }
  }
  return counts
}

async function writeLevels(
  container: MedusaContainer,
  changes: StockChange[]
): Promise<{ created: number; updated: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "inventory_items.inventory_item_id"],
    filters: { id: changes.map((change) => change.variant_id) },
  })
  const inventoryItemByVariant = new Map(
    (variants as unknown as { id: string; inventory_items?: { inventory_item_id: string }[] }[]).map(
      (variant) => [variant.id, variant.inventory_items?.[0]?.inventory_item_id]
    )
  )

  // Later writes win: a branch can be both the old home of one row and the new one of another.
  const targets = new Map<string, { inventory_item_id: string; location_id: string; stocked_quantity: number }>()
  const setTarget = (inventoryItemId: string, locationId: string, quantity: number) =>
    targets.set(levelKey(inventoryItemId, locationId), {
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      stocked_quantity: quantity,
    })

  for (const change of changes) {
    const inventoryItemId = inventoryItemByVariant.get(change.variant_id)
    if (!inventoryItemId) {
      continue
    }
    const previous = change.synced_stock_location_id
    if (previous && previous !== change.target_location_id) {
      setTarget(inventoryItemId, previous, 0)
    }
  }
  for (const change of changes) {
    const inventoryItemId = inventoryItemByVariant.get(change.variant_id)
    if (inventoryItemId && change.target_location_id) {
      setTarget(inventoryItemId, change.target_location_id, change.available)
    }
  }

  const levels = [...targets.values()]
  if (!levels.length) {
    return { created: 0, updated: 0 }
  }
  const existing = await container.resolve(Modules.INVENTORY).listInventoryLevels({
    inventory_item_id: levels.map((level) => level.inventory_item_id),
    location_id: levels.map((level) => level.location_id),
  })
  const existingKeys = new Set(existing.map((l) => levelKey(l.inventory_item_id, l.location_id)))
  const update = levels.filter((l) => existingKeys.has(levelKey(l.inventory_item_id, l.location_id)))
  // A zero with no level needs nothing: no level already means none to sell.
  const create = levels.filter(
    (l) => !existingKeys.has(levelKey(l.inventory_item_id, l.location_id)) && l.stocked_quantity > 0
  )

  if (create.length) {
    await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: create } })
  }
  if (update.length) {
    await updateInventoryLevelsWorkflow(container).run({ input: { updates: update } })
  }
  return { created: create.length, updated: update.length }
}
