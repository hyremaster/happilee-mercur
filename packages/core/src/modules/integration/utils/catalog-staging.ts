import { createHash } from "node:crypto"

import { generateEntityId } from "@medusajs/framework/utils"
import {
  ExternalItem,
  ExternalItemPrice,
  ExternalStockLevel,
  IntegrationCatalogAttributePairs,
  IntegrationCatalogCount,
} from "@mercurjs/types"

/**
 * Bulk staging writes for catalogue sync streams. Each page is written with a
 * few set-based statements instead of per-row ORM calls (~155k item × outlet
 * rows on a full GoFrugal pull). Rows are passed as ONE jsonb parameter and
 * expanded with jsonb_to_recordset, which avoids Postgres' bind-parameter
 * limit and knex's array expansion.
 *
 * Every upsert reads the previous hashes in a CTE (statement snapshot), so
 * counts are exact and items whose data changed get `projection_pending`.
 */

/** The subset of MikroORM's SqlEntityManager these helpers need. */
export type SqlExecutor = {
  execute(sql: string, params?: unknown[]): Promise<unknown>
}

type Scope = { seller_id: string; provider_id: string }

type CountRow = Record<string, string | number | null>

const rowsOf = (result: unknown): CountRow[] =>
  Array.isArray(result) ? (result as CountRow[]) : []

const num = (value: string | number | null | undefined): number => {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Deterministic JSON: object keys sorted at every level. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`
  }
  return JSON.stringify(value ?? null)
}

export const hashOf = (value: unknown): string =>
  createHash("sha1").update(stableStringify(value)).digest("hex")

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }
  const s = String(value).trim()
  return s ? s : null
}

const finite = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Medusa bigNumber raw column value. */
const RAW_NUMBER = (column: string) =>
  `CASE WHEN x.${column} IS NULL THEN NULL ELSE jsonb_build_object('value', x.${column}::text, 'precision', 20) END`

export type ItemsPageResult = {
  found: number
  created: number
  updated: number
  unchanged: number
  location_rows: number
  location_changed: number
}

/**
 * Upsert one page of items and their per-location rows. A provider may repeat
 * an item within a page (one record per item × outlet); records are merged,
 * the last value winning per location.
 */
export async function upsertItemsPage(
  db: SqlExecutor,
  scope: Scope,
  items: ExternalItem[],
  now: Date
): Promise<ItemsPageResult> {
  const merged = new Map<string, ExternalItem>()
  for (const item of items) {
    const externalId = text(item.external_id)
    if (!externalId) {
      continue
    }
    const previous = merged.get(externalId)
    merged.set(externalId, {
      ...item,
      external_id: externalId,
      locations: [...(previous?.locations ?? []), ...(item.locations ?? [])],
    })
  }

  if (!merged.size) {
    return { found: 0, created: 0, updated: 0, unchanged: 0, location_rows: 0, location_changed: 0 }
  }

  const itemRows = [...merged.values()].map((item) => {
    const data = {
      name: text(item.name) ?? item.external_id,
      sku: text(item.sku),
      barcode: text(item.barcode),
      status: text(item.status),
      manufacturer: text(item.manufacturer),
      tax_rate: finite(item.tax_rate),
      hsn_code: text(item.hsn_code),
      attributes: item.attributes ?? null,
      raw: item.raw ?? null,
    }
    return {
      id: generateEntityId(undefined, "intitem"),
      external_id: item.external_id,
      ...data,
      raw_hash: hashOf(data),
    }
  })

  const [itemCounts] = rowsOf(
    await db.execute(
      `
      WITH incoming AS (
        SELECT * FROM jsonb_to_recordset(?::jsonb) AS x(
          id text, external_id text, name text, sku text, barcode text, status text,
          manufacturer text, tax_rate real, hsn_code text, attributes jsonb, raw jsonb, raw_hash text
        )
      ),
      prev AS (
        SELECT i.external_id, i.raw_hash, i.is_active
        FROM integration_external_item i
        JOIN incoming x ON x.external_id = i.external_id
        WHERE i.seller_id = ? AND i.provider_id = ? AND i.deleted_at IS NULL
      ),
      upserted AS (
        INSERT INTO integration_external_item (
          id, seller_id, provider_id, external_id, name, sku, barcode, status, is_active,
          manufacturer, tax_rate, hsn_code, attributes, raw, raw_hash, projection_pending,
          last_seen_at, created_at, updated_at
        )
        SELECT x.id, ?, ?, x.external_id, x.name, x.sku, x.barcode, x.status, true,
          x.manufacturer, x.tax_rate, x.hsn_code, x.attributes, x.raw, x.raw_hash, true,
          ?::timestamptz, now(), now()
        FROM incoming x
        ON CONFLICT (seller_id, provider_id, external_id) WHERE deleted_at IS NULL
        DO UPDATE SET
          name = EXCLUDED.name, sku = EXCLUDED.sku, barcode = EXCLUDED.barcode,
          status = EXCLUDED.status, manufacturer = EXCLUDED.manufacturer,
          tax_rate = EXCLUDED.tax_rate, hsn_code = EXCLUDED.hsn_code,
          attributes = EXCLUDED.attributes, raw = EXCLUDED.raw,
          projection_pending = integration_external_item.projection_pending
            OR integration_external_item.raw_hash IS DISTINCT FROM EXCLUDED.raw_hash
            OR NOT integration_external_item.is_active,
          updated_at = CASE
            WHEN integration_external_item.raw_hash IS DISTINCT FROM EXCLUDED.raw_hash
              OR NOT integration_external_item.is_active
            THEN now() ELSE integration_external_item.updated_at END,
          raw_hash = EXCLUDED.raw_hash,
          is_active = true,
          last_seen_at = EXCLUDED.last_seen_at
        RETURNING 1
      )
      SELECT
        (SELECT count(*) FROM incoming) AS found,
        (SELECT count(*) FROM incoming x WHERE NOT EXISTS (SELECT 1 FROM prev p WHERE p.external_id = x.external_id)) AS created,
        (SELECT count(*) FROM incoming x JOIN prev p ON p.external_id = x.external_id
          WHERE p.raw_hash IS DISTINCT FROM x.raw_hash OR NOT p.is_active) AS updated,
        (SELECT count(*) FROM upserted) AS written
      `,
      [
        JSON.stringify(itemRows),
        scope.seller_id,
        scope.provider_id,
        scope.seller_id,
        scope.provider_id,
        now.toISOString(),
      ]
    )
  )

  const locationsByKey = new Map<string, Record<string, unknown>>()
  for (const item of merged.values()) {
    for (const location of item.locations ?? []) {
      const locationId = text(location.location_external_id)
      if (!locationId) {
        continue
      }
      const data = {
        sku: text(location.sku),
        is_online: typeof location.is_online === "boolean" ? location.is_online : null,
        buffer_qty: finite(location.buffer_qty),
        special_price: finite(location.special_price),
        attributes: location.attributes ?? null,
        raw: location.raw ?? null,
      }
      locationsByKey.set(`${item.external_id}\u0000${locationId}`, {
        id: generateEntityId(undefined, "intitloc"),
        item_external_id: item.external_id,
        location_external_id: locationId,
        ...data,
        raw_hash: hashOf(data),
      })
    }
  }

  let locationCounts: CountRow = { rows: 0, changed: 0 }
  if (locationsByKey.size) {
    ;[locationCounts] = rowsOf(
      await db.execute(
        `
        WITH incoming AS (
          SELECT * FROM jsonb_to_recordset(?::jsonb) AS x(
            id text, item_external_id text, location_external_id text, sku text,
            is_online boolean, buffer_qty real, special_price numeric,
            attributes jsonb, raw jsonb, raw_hash text
          )
        ),
        prev AS (
          SELECT l.item_external_id, l.location_external_id, l.raw_hash
          FROM integration_external_item_location l
          JOIN incoming x ON x.item_external_id = l.item_external_id
            AND x.location_external_id = l.location_external_id
          WHERE l.seller_id = ? AND l.provider_id = ? AND l.deleted_at IS NULL
        ),
        changed AS (
          SELECT x.* FROM incoming x
          LEFT JOIN prev p ON p.item_external_id = x.item_external_id
            AND p.location_external_id = x.location_external_id
          WHERE p.raw_hash IS DISTINCT FROM x.raw_hash
        ),
        upserted AS (
          INSERT INTO integration_external_item_location (
            id, seller_id, provider_id, item_external_id, location_external_id, sku,
            is_online, buffer_qty, special_price, raw_special_price, attributes, raw,
            raw_hash, item_changed_at, created_at, updated_at
          )
          SELECT x.id, ?, ?, x.item_external_id, x.location_external_id, x.sku,
            x.is_online, x.buffer_qty, x.special_price, ${RAW_NUMBER("special_price")},
            x.attributes, x.raw, x.raw_hash, ?::timestamptz, now(), now()
          FROM changed x
          ON CONFLICT (seller_id, provider_id, item_external_id, location_external_id)
            WHERE deleted_at IS NULL
          DO UPDATE SET
            sku = EXCLUDED.sku, is_online = EXCLUDED.is_online,
            buffer_qty = EXCLUDED.buffer_qty, special_price = EXCLUDED.special_price,
            raw_special_price = EXCLUDED.raw_special_price,
            attributes = EXCLUDED.attributes, raw = EXCLUDED.raw,
            raw_hash = EXCLUDED.raw_hash, item_changed_at = EXCLUDED.item_changed_at,
            updated_at = now()
          RETURNING item_external_id
        ),
        pending AS (
          UPDATE integration_external_item SET projection_pending = true
          WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL
            AND projection_pending = false
            AND external_id IN (SELECT item_external_id FROM upserted)
          RETURNING 1
        )
        SELECT (SELECT count(*) FROM incoming) AS rows,
          (SELECT count(*) FROM changed) AS changed,
          (SELECT count(*) FROM pending) AS pending
        `,
        [
          JSON.stringify([...locationsByKey.values()]),
          scope.seller_id,
          scope.provider_id,
          scope.seller_id,
          scope.provider_id,
          now.toISOString(),
          scope.seller_id,
          scope.provider_id,
        ]
      )
    )
  }

  const found = num(itemCounts?.found)
  const created = num(itemCounts?.created)
  const updated = num(itemCounts?.updated)
  return {
    found,
    created,
    updated,
    unchanged: found - created - updated,
    location_rows: num(locationCounts?.rows),
    location_changed: num(locationCounts?.changed),
  }
}

export type PricesPageResult = {
  found: number
  matched: number
  unmatched: number
  changed: number
}

/**
 * Upsert one page of per-location prices. Rows identified by `item_sku` are
 * resolved to the item through the staged per-location sku first, then the
 * item-level sku. Rows that match no staged item are skipped and counted
 * (`unmatched`); the weekly full prices pull picks them up once items exist.
 */
export async function upsertPricesPage(
  db: SqlExecutor,
  scope: Scope,
  prices: ExternalItemPrice[],
  now: Date
): Promise<PricesPageResult> {
  const byKey = new Map<string, Record<string, unknown>>()
  for (const price of prices) {
    const locationId = text(price.location_external_id)
    const itemId = text(price.item_external_id)
    const sku = text(price.item_sku)
    if (!locationId || (!itemId && !sku)) {
      continue
    }
    const data = {
      mrp: finite(price.mrp),
      sale_price: finite(price.sale_price),
      original_price: finite(price.original_price),
      tax_rate: finite(price.tax_rate),
      raw: price.raw ?? null,
    }
    byKey.set(`${itemId ?? `sku:${sku}`}\u0000${locationId}`, {
      id: generateEntityId(undefined, "intitloc"),
      item_external_id: itemId,
      item_sku: sku,
      location_external_id: locationId,
      ...data,
      price_hash: hashOf(data),
    })
  }

  if (!byKey.size) {
    return { found: 0, matched: 0, unmatched: 0, changed: 0 }
  }

  const [counts] = rowsOf(
    await db.execute(
      `
      WITH raw_incoming AS (
        SELECT * FROM jsonb_to_recordset(?::jsonb) AS x(
          id text, item_external_id text, item_sku text, location_external_id text,
          mrp numeric, sale_price numeric, original_price numeric, tax_rate real,
          raw jsonb, price_hash text
        )
      ),
      resolved AS (
        SELECT r.*, COALESCE(
          r.item_external_id,
          (SELECT l.item_external_id FROM integration_external_item_location l
            WHERE l.seller_id = ? AND l.provider_id = ? AND l.deleted_at IS NULL
              AND l.sku = r.item_sku AND l.location_external_id = r.location_external_id
            LIMIT 1),
          (SELECT i.external_id FROM integration_external_item i
            WHERE i.seller_id = ? AND i.provider_id = ? AND i.deleted_at IS NULL
              AND i.sku = r.item_sku
            LIMIT 1)
        ) AS item_id
        FROM raw_incoming r
      ),
      incoming AS (
        SELECT DISTINCT ON (item_id, location_external_id) * FROM resolved
        WHERE item_id IS NOT NULL
        ORDER BY item_id, location_external_id
      ),
      prev AS (
        SELECT l.item_external_id, l.location_external_id, l.price_hash
        FROM integration_external_item_location l
        JOIN incoming x ON x.item_id = l.item_external_id
          AND x.location_external_id = l.location_external_id
        WHERE l.seller_id = ? AND l.provider_id = ? AND l.deleted_at IS NULL
      ),
      changed AS (
        SELECT x.* FROM incoming x
        LEFT JOIN prev p ON p.item_external_id = x.item_id
          AND p.location_external_id = x.location_external_id
        WHERE p.price_hash IS DISTINCT FROM x.price_hash
      ),
      upserted AS (
        INSERT INTO integration_external_item_location (
          id, seller_id, provider_id, item_external_id, location_external_id,
          mrp, raw_mrp, sale_price, raw_sale_price, original_price, raw_original_price,
          tax_rate, price_raw, price_hash, price_changed_at, created_at, updated_at
        )
        SELECT x.id, ?, ?, x.item_id, x.location_external_id,
          x.mrp, ${RAW_NUMBER("mrp")}, x.sale_price, ${RAW_NUMBER("sale_price")},
          x.original_price, ${RAW_NUMBER("original_price")},
          x.tax_rate, x.raw, x.price_hash, ?::timestamptz, now(), now()
        FROM changed x
        ON CONFLICT (seller_id, provider_id, item_external_id, location_external_id)
          WHERE deleted_at IS NULL
        DO UPDATE SET
          mrp = EXCLUDED.mrp, raw_mrp = EXCLUDED.raw_mrp,
          sale_price = EXCLUDED.sale_price, raw_sale_price = EXCLUDED.raw_sale_price,
          original_price = EXCLUDED.original_price,
          raw_original_price = EXCLUDED.raw_original_price,
          tax_rate = EXCLUDED.tax_rate, price_raw = EXCLUDED.price_raw,
          price_hash = EXCLUDED.price_hash, price_changed_at = EXCLUDED.price_changed_at,
          updated_at = now()
        RETURNING item_external_id
      ),
      pending AS (
        UPDATE integration_external_item SET projection_pending = true
        WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL
          AND projection_pending = false
          AND external_id IN (SELECT item_external_id FROM upserted)
        RETURNING 1
      )
      SELECT (SELECT count(*) FROM raw_incoming) AS found,
        (SELECT count(*) FROM resolved WHERE item_id IS NOT NULL) AS matched,
        (SELECT count(*) FROM resolved WHERE item_id IS NULL) AS unmatched,
        (SELECT count(*) FROM changed) AS changed,
        (SELECT count(*) FROM pending) AS pending
      `,
      [
        JSON.stringify([...byKey.values()]),
        scope.seller_id,
        scope.provider_id,
        scope.seller_id,
        scope.provider_id,
        scope.seller_id,
        scope.provider_id,
        scope.seller_id,
        scope.provider_id,
        now.toISOString(),
        scope.seller_id,
        scope.provider_id,
      ]
    )
  )

  return {
    found: num(counts?.found),
    matched: num(counts?.matched),
    unmatched: num(counts?.unmatched),
    changed: num(counts?.changed),
  }
}

export type StockPageResult = { found: number; created: number; changed: number }

/**
 * Upsert one page of a full stock snapshot. Every row's `seen_at` is
 * refreshed (even unchanged ones) so `zeroUnseenStock` can tell which lots
 * were missing from the snapshot. Duplicate lots in a page are summed.
 */
export async function upsertStockPage(
  db: SqlExecutor,
  scope: Scope,
  levels: ExternalStockLevel[],
  now: Date
): Promise<StockPageResult> {
  const byKey = new Map<string, { item: string; location: string; lot: string; quantity: number; mrp: number | null; raw: unknown }>()
  for (const level of levels) {
    const item = text(level.item_external_id)
    const location = text(level.location_external_id)
    const lot = text(level.lot_key)
    if (!item || !location || !lot) {
      continue
    }
    const key = `${item}\u0000${location}\u0000${lot}`
    const previous = byKey.get(key)
    byKey.set(key, {
      item,
      location,
      lot,
      quantity: (previous?.quantity ?? 0) + (finite(level.quantity) ?? 0),
      mrp: finite(level.mrp),
      raw: level.raw ?? null,
    })
  }

  if (!byKey.size) {
    return { found: 0, created: 0, changed: 0 }
  }

  const rows = [...byKey.values()].map((level) => {
    const data = { quantity: level.quantity, mrp: level.mrp }
    return {
      id: generateEntityId(undefined, "intstock"),
      item_external_id: level.item,
      location_external_id: level.location,
      lot_key: level.lot,
      ...data,
      raw: level.raw,
      raw_hash: hashOf(data),
    }
  })

  const [counts] = rowsOf(
    await db.execute(
      `
      WITH incoming AS (
        SELECT * FROM jsonb_to_recordset(?::jsonb) AS x(
          id text, item_external_id text, location_external_id text, lot_key text,
          quantity real, mrp numeric, raw jsonb, raw_hash text
        )
      ),
      prev AS (
        SELECT s.item_external_id, s.location_external_id, s.lot_key, s.raw_hash
        FROM integration_external_stock s
        JOIN incoming x ON x.item_external_id = s.item_external_id
          AND x.location_external_id = s.location_external_id AND x.lot_key = s.lot_key
        WHERE s.seller_id = ? AND s.provider_id = ? AND s.deleted_at IS NULL
      ),
      changed AS (
        SELECT x.*, (p.raw_hash IS NULL) AS is_new FROM incoming x
        LEFT JOIN prev p ON p.item_external_id = x.item_external_id
          AND p.location_external_id = x.location_external_id AND p.lot_key = x.lot_key
        WHERE p.raw_hash IS DISTINCT FROM x.raw_hash
      ),
      upserted AS (
        INSERT INTO integration_external_stock (
          id, seller_id, provider_id, item_external_id, location_external_id, lot_key,
          quantity, mrp, raw_mrp, raw, raw_hash, seen_at, created_at, updated_at
        )
        SELECT x.id, ?, ?, x.item_external_id, x.location_external_id, x.lot_key,
          x.quantity, x.mrp, ${RAW_NUMBER("mrp")}, x.raw, x.raw_hash, ?::timestamptz, now(), now()
        FROM incoming x
        ON CONFLICT (seller_id, provider_id, item_external_id, location_external_id, lot_key)
          WHERE deleted_at IS NULL
        DO UPDATE SET
          quantity = EXCLUDED.quantity, mrp = EXCLUDED.mrp, raw_mrp = EXCLUDED.raw_mrp,
          raw = EXCLUDED.raw, seen_at = EXCLUDED.seen_at,
          updated_at = CASE WHEN integration_external_stock.raw_hash IS DISTINCT FROM EXCLUDED.raw_hash
            THEN now() ELSE integration_external_stock.updated_at END,
          raw_hash = EXCLUDED.raw_hash
        RETURNING 1
      ),
      pending AS (
        UPDATE integration_external_item SET projection_pending = true
        WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL
          AND projection_pending = false
          AND external_id IN (SELECT item_external_id FROM changed)
        RETURNING 1
      )
      SELECT (SELECT count(*) FROM incoming) AS found,
        (SELECT count(*) FROM changed WHERE is_new) AS created,
        (SELECT count(*) FROM changed) AS changed,
        (SELECT count(*) FROM upserted) AS written,
        (SELECT count(*) FROM pending) AS pending
      `,
      [
        JSON.stringify(rows),
        scope.seller_id,
        scope.provider_id,
        scope.seller_id,
        scope.provider_id,
        now.toISOString(),
        scope.seller_id,
        scope.provider_id,
      ]
    )
  )

  return {
    found: num(counts?.found),
    created: num(counts?.created),
    changed: num(counts?.changed),
  }
}

/** After a complete full items pull: items not seen since `before` become inactive. */
export async function deactivateUnseenItems(
  db: SqlExecutor,
  scope: Scope,
  before: Date
): Promise<number> {
  const rows = rowsOf(
    await db.execute(
      `UPDATE integration_external_item
        SET is_active = false, projection_pending = true, updated_at = now()
        WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL
          AND is_active = true AND last_seen_at < ?::timestamptz
        RETURNING 1`,
      [scope.seller_id, scope.provider_id, before.toISOString()]
    )
  )
  return rows.length
}

/** After a complete stock snapshot: lots not seen since `before` go to 0. */
export async function zeroUnseenStock(
  db: SqlExecutor,
  scope: Scope,
  before: Date
): Promise<number> {
  const [counts] = rowsOf(
    await db.execute(
      `
      WITH zeroed AS (
        UPDATE integration_external_stock
          SET quantity = 0, raw_hash = 'unseen', updated_at = now()
          WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL
            AND quantity <> 0 AND seen_at < ?::timestamptz
          RETURNING item_external_id
      ),
      pending AS (
        UPDATE integration_external_item SET projection_pending = true
        WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL
          AND projection_pending = false
          AND external_id IN (SELECT item_external_id FROM zeroed)
        RETURNING 1
      )
      SELECT (SELECT count(*) FROM zeroed) AS zeroed, (SELECT count(*) FROM pending) AS pending
      `,
      [
        scope.seller_id,
        scope.provider_id,
        before.toISOString(),
        scope.seller_id,
        scope.provider_id,
      ]
    )
  )
  return num(counts?.zeroed)
}

export type CatalogSummaryCounts = {
  items: number
  active_items: number
  item_locations: number
  stock_rows: number
  multi_lot_price_pairs: number
  sale_price_above_min_lot_mrp: number
  lot_price_spread_total: number
  by_status: IntegrationCatalogCount[]
  by_attribute: Record<string, IntegrationCatalogCount[]>
  attribute_pairs: IntegrationCatalogAttributePairs | null
}

const ATTRIBUTE_VALUE_LIMIT = 50
const ATTRIBUTE_PAIR_LIMIT = 100

/**
 * Counts over staged data that answer the catalogue-rule questions: how many
 * items each category value covers, which status codes exist, and how often
 * in-stock lots of the same item at one location carry different MRPs.
 * "In stock" = quantity > 0.
 */
export async function catalogSummary(
  db: SqlExecutor,
  scope: Scope,
  attributeKeys: string[]
): Promise<CatalogSummaryCounts> {
  const params = [scope.seller_id, scope.provider_id]
  const scoped = `seller_id = ? AND provider_id = ? AND deleted_at IS NULL`

  const [totals] = rowsOf(
    await db.execute(
      `SELECT
        (SELECT count(*) FROM integration_external_item WHERE ${scoped}) AS items,
        (SELECT count(*) FROM integration_external_item WHERE ${scoped} AND is_active) AS active_items,
        (SELECT count(*) FROM integration_external_item_location WHERE ${scoped}) AS item_locations,
        (SELECT count(*) FROM integration_external_stock WHERE ${scoped} AND quantity > 0) AS stock_rows`,
      [...params, ...params, ...params, ...params]
    )
  )

  const [lots] = rowsOf(
    await db.execute(
      `SELECT count(*) AS pairs, COALESCE(sum(max_mrp - min_mrp), 0) AS spread
        FROM (
          SELECT item_external_id, location_external_id, max(mrp) AS max_mrp, min(mrp) AS min_mrp
          FROM integration_external_stock
          WHERE ${scoped} AND quantity > 0 AND mrp IS NOT NULL
          GROUP BY item_external_id, location_external_id
          HAVING count(DISTINCT mrp) > 1
        ) multi`,
      params
    )
  )

  const [above] = rowsOf(
    await db.execute(
      `SELECT count(*) AS pairs
        FROM integration_external_item_location l
        JOIN (
          SELECT item_external_id, location_external_id, min(mrp) AS min_mrp
          FROM integration_external_stock
          WHERE ${scoped} AND quantity > 0 AND mrp IS NOT NULL
          GROUP BY item_external_id, location_external_id
        ) s ON s.item_external_id = l.item_external_id
          AND s.location_external_id = l.location_external_id
        WHERE l.seller_id = ? AND l.provider_id = ? AND l.deleted_at IS NULL
          AND l.sale_price > s.min_mrp`,
      [...params, ...params]
    )
  )

  const toCounts = (result: unknown): IntegrationCatalogCount[] =>
    rowsOf(result).map((row) => ({
      value: row.value === null || row.value === undefined ? null : String(row.value),
      count: num(row.count),
    }))

  const byStatus = toCounts(
    await db.execute(
      `SELECT status AS value, count(*) AS count FROM integration_external_item
        WHERE ${scoped} GROUP BY status ORDER BY count(*) DESC`,
      params
    )
  )

  const byAttribute: Record<string, IntegrationCatalogCount[]> = {}
  for (const key of attributeKeys) {
    byAttribute[key] = toCounts(
      await db.execute(
        `SELECT attributes ->> ? AS value, count(*) AS count FROM integration_external_item
          WHERE ${scoped} GROUP BY 1 ORDER BY count(*) DESC LIMIT ${ATTRIBUTE_VALUE_LIMIT}`,
        [key, ...params]
      )
    )
  }

  let pairs: IntegrationCatalogAttributePairs | null = null
  if (attributeKeys.length >= 2) {
    const [first, second] = attributeKeys
    pairs = {
      keys: [first, second],
      rows: rowsOf(
        await db.execute(
          `SELECT attributes ->> ? AS a, attributes ->> ? AS b, count(*) AS count
            FROM integration_external_item
            WHERE ${scoped} GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT ${ATTRIBUTE_PAIR_LIMIT}`,
          [first, second, ...params]
        )
      ).map((row) => ({
        values: [
          row.a === null || row.a === undefined ? null : String(row.a),
          row.b === null || row.b === undefined ? null : String(row.b),
        ],
        count: num(row.count),
      })),
    }
  }

  return {
    items: num(totals?.items),
    active_items: num(totals?.active_items),
    item_locations: num(totals?.item_locations),
    stock_rows: num(totals?.stock_rows),
    multi_lot_price_pairs: num(lots?.pairs),
    lot_price_spread_total: Math.round(num(lots?.spread) * 100) / 100,
    sale_price_above_min_lot_mrp: num(above?.pairs),
    by_status: byStatus,
    by_attribute: byAttribute,
    attribute_pairs: pairs,
  }
}
