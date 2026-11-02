import type { SqlExecutor } from "./catalog-staging"

type Scope = { seller_id: string; provider_id: string }

export type ProjectionItem = {
  external_id: string
  name: string
  sku: string | null
  barcode: string | null
  is_eligible: boolean
  tax_rate: number | null
  hsn_code: string | null
  product_id: string | null
  variant_id: string | null
  /** The row's updated_at as text, to spot a change made during the projection. */
  version: string
}

const MAX_ERROR_LENGTH = 1000

/**
 * The next pending items that need work in Medusa: eligible ones, and blocked
 * ones that already have a product. Ordered by id so a run passes each item
 * once, even one that fails and stays pending.
 */
export async function listProjectionPage(
  db: SqlExecutor,
  scope: Scope,
  afterExternalId: string,
  limit: number
): Promise<ProjectionItem[]> {
  return (await db.execute(
    `SELECT external_id, name, sku, barcode, is_eligible, tax_rate, hsn_code, product_id, variant_id,
        updated_at::text AS version
      FROM integration_external_item
      WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL AND projection_pending
        AND (is_eligible OR product_id IS NOT NULL)
        AND external_id > ?
      ORDER BY external_id
      LIMIT ?`,
    [scope.seller_id, scope.provider_id, afterExternalId, limit]
  )) as ProjectionItem[]
}

/** Blocked items with no product need no work in Medusa. Returns how many were cleared. */
export async function clearBlockedItemsWithoutProduct(
  db: SqlExecutor,
  scope: Scope
): Promise<number> {
  const rows = (await db.execute(
    `UPDATE integration_external_item SET projection_pending = false
      WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL AND projection_pending
        AND NOT is_eligible AND product_id IS NULL
      RETURNING 1`,
    [scope.seller_id, scope.provider_id]
  )) as unknown[]
  return rows.length
}

/**
 * Save where each item landed. An item that changed since it was read stays
 * pending, so the change isn't lost.
 */
export async function recordProjectedItems(
  db: SqlExecutor,
  scope: Scope,
  rows: { external_id: string; version: string; product_id: string; variant_id: string | null }[]
): Promise<void> {
  if (!rows.length) {
    return
  }
  await db.execute(
    `UPDATE integration_external_item i SET
        product_id = x.product_id,
        variant_id = x.variant_id,
        projection_error = NULL,
        projection_pending = i.updated_at::text IS DISTINCT FROM x.version
      FROM jsonb_to_recordset(?::jsonb) AS x(
        external_id text, version text, product_id text, variant_id text
      )
      WHERE i.seller_id = ? AND i.provider_id = ? AND i.deleted_at IS NULL
        AND i.external_id = x.external_id`,
    [JSON.stringify(rows), scope.seller_id, scope.provider_id]
  )
}

/** Keep the item pending for the next run, with the reason for operators (never sent to the panel). */
export async function recordFailedProjection(
  db: SqlExecutor,
  scope: Scope,
  externalId: string,
  error: string
): Promise<void> {
  await db.execute(
    `UPDATE integration_external_item SET projection_error = ?
      WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL AND external_id = ?`,
    [error.slice(0, MAX_ERROR_LENGTH), scope.seller_id, scope.provider_id, externalId]
  )
}
