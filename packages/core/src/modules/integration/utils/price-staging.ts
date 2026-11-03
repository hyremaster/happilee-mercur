import type { SqlExecutor } from "./catalog-staging"

type Scope = { seller_id: string; provider_id: string }

export type SyncedPrices = { mrp: number; price: number }

export type PriceHoldReason = "invalid_mrp" | "mrp_gap" | "no_price"

/** One outlet that can fulfil the item: mapped, active, sold online, in stock. */
export type OutletOffer = {
  location_external_id: string
  offered: number | null
  lowest_mrp: number | null
  highest_mrp: number | null
  has_invalid_mrp: boolean
}

export type PriceItem = {
  external_id: string
  variant_id: string
  synced_prices: SyncedPrices | null
  price_hold_reason: PriceHoldReason | null
  offers: OutletOffer[]
}

export type ItemPriceResult =
  | { kind: "priced"; prices: SyncedPrices }
  | { kind: "held"; reason: PriceHoldReason }
  | { kind: "no_stock" }

/**
 * Prices this many times apart at one outlet are treated as bad data (a carton
 * MRP on a single unit, a typing error) and hold the item back. Real MRP
 * revisions are far smaller.
 */
export const MAX_MRP_GAP_RATIO = 2

/**
 * The one online price of an item (D-006, D-007): the lowest offer, capped at
 * the lowest in-stock MRP over every outlet that can fulfil it, so it is
 * compliant wherever the order routes. One doubtful outlet holds the whole
 * item: leaving it out could price above the MRP of the stock it ships.
 */
export function computeItemPrice(offers: OutletOffer[]): ItemPriceResult {
  if (!offers.length) {
    return { kind: "no_stock" }
  }
  const lowest = (offer: OutletOffer) => offer.lowest_mrp as number

  if (offers.some((offer) => offer.has_invalid_mrp)) {
    return { kind: "held", reason: "invalid_mrp" }
  }
  const hasGap = (offer: OutletOffer) =>
    Math.max(offer.highest_mrp as number, offer.offered ?? 0) / lowest(offer) >= MAX_MRP_GAP_RATIO
  if (offers.some(hasGap)) {
    return { kind: "held", reason: "mrp_gap" }
  }
  const prices = offers
    .map((offer) => offer.offered)
    .filter((offered): offered is number => offered !== null && offered > 0)
  if (!prices.length) {
    return { kind: "held", reason: "no_price" }
  }
  const mrp = Math.min(...offers.map(lowest))
  return { kind: "priced", prices: { mrp, price: Math.min(...prices, mrp) } }
}

const toNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value))

/** The next eligible items that have a variant, each with the outlets that can fulfil it. */
export async function listPricePage(
  db: SqlExecutor,
  scope: Scope,
  afterExternalId: string,
  limit: number
): Promise<PriceItem[]> {
  const rows = (await db.execute(
    `WITH page AS (
        SELECT external_id, variant_id, synced_prices, price_hold_reason
        FROM integration_external_item
        WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL AND is_eligible
          AND variant_id IS NOT NULL AND external_id > ?
        ORDER BY external_id
        LIMIT ?
      ), offers AS (
        SELECT s.item_external_id, s.location_external_id,
          min(s.mrp) AS lowest_mrp,
          max(s.mrp) AS highest_mrp,
          bool_or(s.mrp IS NULL OR s.mrp <= 0) AS has_invalid_mrp,
          max(CASE WHEN l.special_price > 0 THEN l.special_price ELSE l.sale_price END) AS offered
        FROM page p
        JOIN integration_external_stock s
          ON s.seller_id = ? AND s.provider_id = ? AND s.item_external_id = p.external_id
          AND s.deleted_at IS NULL AND s.quantity > 0
        JOIN integration_external_item_location l
          ON l.seller_id = s.seller_id AND l.provider_id = s.provider_id
          AND l.item_external_id = s.item_external_id
          AND l.location_external_id = s.location_external_id
          AND l.deleted_at IS NULL AND l.is_online
        JOIN integration_location o
          ON o.seller_id = s.seller_id AND o.provider_id = s.provider_id
          AND o.external_id = s.location_external_id
          AND o.deleted_at IS NULL AND o.status = 'active' AND o.stock_location_id IS NOT NULL
        GROUP BY s.item_external_id, s.location_external_id
      )
      SELECT p.external_id, p.variant_id, p.synced_prices, p.price_hold_reason,
        coalesce(
          (SELECT jsonb_agg(to_jsonb(o)) FROM offers o WHERE o.item_external_id = p.external_id),
          '[]'::jsonb
        ) AS offers
      FROM page p
      ORDER BY p.external_id`,
    [
      scope.seller_id,
      scope.provider_id,
      afterExternalId,
      limit,
      scope.seller_id,
      scope.provider_id,
    ]
  )) as (Omit<PriceItem, "offers"> & { offers: Record<string, unknown>[] })[]

  return rows.map((row) => ({
    ...row,
    offers: row.offers.map((offer) => ({
      location_external_id: String(offer.location_external_id),
      offered: toNumber(offer.offered),
      lowest_mrp: toNumber(offer.lowest_mrp),
      highest_mrp: toNumber(offer.highest_mrp),
      has_invalid_mrp: !!offer.has_invalid_mrp,
    })),
  }))
}

/** Save what Medusa now holds for each item. */
export async function recordItemPrices(
  db: SqlExecutor,
  scope: Scope,
  rows: {
    external_id: string
    synced_prices: SyncedPrices | null
    price_hold_reason: PriceHoldReason | null
  }[]
): Promise<void> {
  if (!rows.length) {
    return
  }
  await db.execute(
    `UPDATE integration_external_item i SET
        synced_prices = x.synced_prices,
        price_hold_reason = x.price_hold_reason
      FROM jsonb_to_recordset(?::jsonb) AS x(
        external_id text, synced_prices jsonb, price_hold_reason text
      )
      WHERE i.seller_id = ? AND i.provider_id = ? AND i.deleted_at IS NULL
        AND i.external_id = x.external_id`,
    [JSON.stringify(rows), scope.seller_id, scope.provider_id]
  )
}

/** Save the store's price list. A new list starts empty, so every price is written again. */
export async function savePriceList(
  db: SqlExecutor,
  scope: Scope,
  priceListId: string
): Promise<void> {
  await db.execute(
    `UPDATE store_integration SET price_list_id = ?
      WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL`,
    [priceListId, scope.seller_id, scope.provider_id]
  )
  await db.execute(
    `UPDATE integration_external_item SET synced_prices = NULL
      WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL`,
    [scope.seller_id, scope.provider_id]
  )
}
