import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type RepairedLevel = { inventory_item_id: string; location_id: string; reserved_quantity: string }

/**
 * Sets each inventory level's reserved quantity to the sum of its reservations,
 * for levels where they differ. Returns how many it corrected.
 *
 * Medusa 2.13.4's `restoreReservationItems` reads the reservations before
 * restoring them, finds none, and never adds them back to the level. So when a
 * workflow rolls back after deleting a reservation (a failed fulfilment), the
 * reservation returns but `reserved_quantity` stays too low, which shows stock
 * that's already promised and later goes negative. Remove this once Medusa
 * fixes it.
 */
export async function repairReservedInventory(container: MedusaContainer): Promise<number> {
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const { rows } = (await pg.raw(
    `WITH expected AS (
        SELECT inventory_item_id, location_id, sum(quantity) AS quantity
        FROM reservation_item
        WHERE deleted_at IS NULL
        GROUP BY inventory_item_id, location_id
      ), drifted AS (
        SELECT l.id, coalesce(e.quantity, 0) AS quantity
        FROM inventory_level l
        LEFT JOIN expected e
          ON e.inventory_item_id = l.inventory_item_id AND e.location_id = l.location_id
        WHERE l.deleted_at IS NULL AND l.reserved_quantity IS DISTINCT FROM coalesce(e.quantity, 0)
      )
      UPDATE inventory_level l SET
        reserved_quantity = d.quantity,
        raw_reserved_quantity = jsonb_build_object('value', d.quantity::text, 'precision', 20),
        updated_at = now()
      FROM drifted d
      WHERE l.id = d.id
      RETURNING l.inventory_item_id, l.location_id, l.reserved_quantity`
  )) as { rows: RepairedLevel[] }

  for (const level of rows) {
    logger.error(
      `Corrected reserved quantity to ${level.reserved_quantity} for inventory item ${level.inventory_item_id} at location ${level.location_id}.`
    )
  }
  return rows.length
}
