import type { SqlExecutor } from "./catalog-staging"

type Scope = { seller_id: string; provider_id: string }

export type StockChange = {
  id: string
  item_external_id: string
  variant_id: string
  /** The branch that should hold this stock; null when it can't be sold from this outlet. */
  target_location_id: string | null
  /** floor(Σ in-stock lots) − buffer, never below zero. Zero when there's no target. */
  available: number
  synced_stock: number | null
  synced_stock_location_id: string | null
}

/**
 * The next item × outlet rows whose stock differs from what was last written to
 * Medusa (D-046). Only eligible items with a variant, at mapped, active, online
 * outlets, have stock to sell. A row that held stock elsewhere stays in the list
 * until that branch is zeroed. Ordered by id, so a run passes a failing row once.
 */
export async function listStockChangesPage(
  db: SqlExecutor,
  scope: Scope,
  defaultBuffer: number,
  afterId: string,
  limit: number
): Promise<StockChange[]> {
  const rows = (await db.execute(
    `SELECT * FROM (
        SELECT l.id, l.item_external_id, i.variant_id, l.synced_stock, l.synced_stock_location_id,
          t.target_location_id,
          CASE WHEN t.target_location_id IS NULL THEN 0 ELSE greatest(
            0,
            floor(coalesce((
              SELECT sum(s.quantity) FROM integration_external_stock s
              WHERE s.seller_id = l.seller_id AND s.provider_id = l.provider_id
                AND s.item_external_id = l.item_external_id
                AND s.location_external_id = l.location_external_id
                AND s.deleted_at IS NULL AND s.quantity > 0
            ), 0)) - greatest(coalesce(l.buffer_qty, 0), ?)
          ) END AS available
        FROM integration_external_item_location l
        JOIN integration_external_item i
          ON i.seller_id = l.seller_id AND i.provider_id = l.provider_id
          AND i.external_id = l.item_external_id
          AND i.deleted_at IS NULL AND i.variant_id IS NOT NULL
        LEFT JOIN integration_location o
          ON o.seller_id = l.seller_id AND o.provider_id = l.provider_id
          AND o.external_id = l.location_external_id AND o.deleted_at IS NULL
        CROSS JOIN LATERAL (
          SELECT CASE WHEN i.is_eligible AND l.is_online AND o.status = 'active'
            THEN o.stock_location_id END AS target_location_id
        ) t
        WHERE l.seller_id = ? AND l.provider_id = ? AND l.deleted_at IS NULL AND l.id > ?
          AND (t.target_location_id IS NOT NULL OR l.synced_stock_location_id IS NOT NULL)
      ) c
      WHERE (c.synced_stock_location_id IS NULL AND c.target_location_id IS NOT NULL AND c.available > 0)
        OR (c.synced_stock_location_id IS NOT NULL AND (
          c.target_location_id IS DISTINCT FROM c.synced_stock_location_id
          OR c.available IS DISTINCT FROM c.synced_stock
        ))
      ORDER BY c.id
      LIMIT ?`,
    [defaultBuffer, scope.seller_id, scope.provider_id, afterId, limit]
  )) as (Omit<StockChange, "available"> & { available: string | number })[]

  return rows.map((row) => ({ ...row, available: Number(row.available) }))
}

/** Save what Medusa now holds for each row. */
export async function recordAppliedStock(
  db: SqlExecutor,
  scope: Scope,
  rows: { id: string; synced_stock: number | null; synced_stock_location_id: string | null }[]
): Promise<void> {
  if (!rows.length) {
    return
  }
  await db.execute(
    `UPDATE integration_external_item_location l SET
        synced_stock = x.synced_stock,
        synced_stock_location_id = x.synced_stock_location_id
      FROM jsonb_to_recordset(?::jsonb) AS x(
        id text, synced_stock integer, synced_stock_location_id text
      )
      WHERE l.seller_id = ? AND l.provider_id = ? AND l.id = x.id`,
    [JSON.stringify(rows), scope.seller_id, scope.provider_id]
  )
}
