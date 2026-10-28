import { ExecArgs } from "@medusajs/framework/types"
import { MercurModules } from "@mercurjs/types"

type CatalogSummary = {
  items: number
  active_items: number
  item_locations: number
  stock_rows: number
  multi_lot_price_pairs: number
  sale_price_above_min_lot_mrp: number
  lot_price_spread_total: number
  by_status: { value: string | null; count: number }[]
  by_attribute: Record<string, { value: string | null; count: number }[]>
  attribute_pairs: {
    keys: [string, string]
    rows: { values: [string | null, string | null]; count: number }[]
  } | null
}

type IntegrationService = {
  summarizeExternalCatalog(scope: { seller_id: string; provider_id: string }): Promise<CatalogSummary>
}

const cell = (value: string | null) => (value === null || value === "" ? "(empty)" : value)
const pct = (part: number, total: number) =>
  total ? `${((part / total) * 100).toFixed(1)}%` : "-"

/**
 * Prints a Markdown report of a store's staged catalogue (read-only, reads
 * staging tables only; never calls the provider). Used to answer the
 * catalogue-rule questions with real counts (allowlist, status codes,
 * multi-MRP lots). See docs/features/z-kx-pharma/reference/catalogue-data-questions.md.
 *
 *   bunx medusa exec ./src/scripts/integration-catalog-profile.ts <seller_id> [provider_id]
 */
export default async function integrationCatalogProfile({ container, args }: ExecArgs) {
  const [sellerId, providerId = "gofrugal"] = args ?? []
  if (!sellerId) {
    throw new Error("Usage: medusa exec ./src/scripts/integration-catalog-profile.ts <seller_id> [provider_id]")
  }

  const service = container.resolve(MercurModules.INTEGRATION) as unknown as IntegrationService
  const s = await service.summarizeExternalCatalog({ seller_id: sellerId, provider_id: providerId })

  const lines: string[] = []
  lines.push(`# Staged catalogue profile: ${providerId} (store ${sellerId})`, "")
  lines.push(`Generated ${new Date().toISOString()}. Counts come from staging tables, not from live ${providerId}.`, "")
  lines.push("| Measure | Count |", "|---|---|")
  lines.push(`| Items | ${s.items} (${s.active_items} active) |`)
  lines.push(`| Item × outlet rows | ${s.item_locations} |`)
  lines.push(`| In-stock lots (item × outlet × MRP) | ${s.stock_rows} |`)
  lines.push(`| Item × outlet pairs with more than one in-stock MRP (Q-F01) | ${s.multi_lot_price_pairs} |`)
  lines.push(`| Total MRP spread over those pairs (highest − lowest, ₹) | ${s.lot_price_spread_total} |`)
  lines.push(`| Pairs whose sale price is above the lowest in-stock MRP (Q-G09) | ${s.sale_price_above_min_lot_mrp} |`, "")

  lines.push("## Item status codes (Q-G15)", "", "| Status | Items | Share |", "|---|---|---|")
  for (const row of s.by_status) {
    lines.push(`| ${cell(row.value)} | ${row.count} | ${pct(row.count, s.items)} |`)
  }
  lines.push("")

  for (const [key, rows] of Object.entries(s.by_attribute)) {
    lines.push(`## ${key} (top ${rows.length})`, "", `| ${key} | Items | Share |`, "|---|---|---|")
    for (const row of rows) {
      lines.push(`| ${cell(row.value)} | ${row.count} | ${pct(row.count, s.items)} |`)
    }
    lines.push("")
  }

  if (s.attribute_pairs) {
    const [a, b] = s.attribute_pairs.keys
    lines.push(`## ${a} × ${b} (Q-C01 allowlist)`, "", `| ${a} | ${b} | Items |`, "|---|---|---|")
    for (const row of s.attribute_pairs.rows) {
      lines.push(`| ${cell(row.values[0])} | ${cell(row.values[1])} | ${row.count} |`)
    }
    lines.push("")
  }

  // Plain stdout so the report can be redirected into a file.
  process.stdout.write(`${lines.join("\n")}\n`)
}
