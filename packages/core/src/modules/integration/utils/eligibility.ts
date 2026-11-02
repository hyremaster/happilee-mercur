import { IntegrationEligibilityRule } from "@mercurjs/types"

import type { SqlExecutor } from "./catalog-staging"

type Scope = { seller_id: string; provider_id: string }

export type EligibilityResult = {
  is_eligible: boolean
  /** Why the item is blocked; null when eligible. See {@link evaluateEligibility}. */
  reason: string | null
}

type EligibilityInput = {
  is_active: boolean
  status: string | null
  attributes: Record<string, unknown> | null
}

const isNonBlankStringList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((entry) => typeof entry === "string" && entry.trim() !== "")

/**
 * A usable rule, or null. A rule that allows nothing specific (no attributes,
 * an empty list) is not usable, because it must never mean "allow everything".
 */
export function parseEligibilityRule(value: unknown): IntegrationEligibilityRule | null {
  if (!value || typeof value !== "object") {
    return null
  }
  const { attributes_in, status_not_in } = value as Record<string, unknown>
  if (!attributes_in || typeof attributes_in !== "object" || Array.isArray(attributes_in)) {
    return null
  }
  const lists = Object.entries(attributes_in)
  if (!lists.length || !lists.every(([key, list]) => key.trim() !== "" && isNonBlankStringList(list))) {
    return null
  }
  if (status_not_in !== undefined && !(Array.isArray(status_not_in) && status_not_in.every((s) => typeof s === "string"))) {
    return null
  }
  return {
    attributes_in: attributes_in as Record<string, string[]>,
    ...(status_not_in ? { status_not_in: status_not_in as string[] } : {}),
  }
}

/**
 * Fail-closed check of one staged item: an item is eligible only when it is
 * active and every attribute on the rule has an allowed value (exact match).
 * Reasons: `no_rule`, `inactive`, `status_excluded`, `missing:<key>`,
 * `not_allowed:<key>`.
 */
export function evaluateEligibility(
  item: EligibilityInput,
  rule: IntegrationEligibilityRule | null
): EligibilityResult {
  const blocked = (reason: string): EligibilityResult => ({ is_eligible: false, reason })

  if (!rule) {
    return blocked("no_rule")
  }
  if (!item.is_active) {
    return blocked("inactive")
  }
  if (item.status !== null && rule.status_not_in?.includes(item.status)) {
    return blocked("status_excluded")
  }
  for (const [key, allowed] of Object.entries(rule.attributes_in)) {
    const raw = item.attributes?.[key]
    const value = raw === null || raw === undefined ? "" : String(raw).trim()
    if (!value) {
      return blocked(`missing:${key}`)
    }
    if (!allowed.includes(value)) {
      return blocked(`not_allowed:${key}`)
    }
  }
  return { is_eligible: true, reason: null }
}

type StagedRow = EligibilityInput & {
  external_id: string
  is_eligible: boolean
  eligibility_reason: string | null
}

/**
 * Re-evaluate staged items (only `externalIds` when given) and write results
 * that changed. An item that flips between eligible and not is flagged for
 * projection; other items are left alone so a rule change doesn't re-project
 * the whole catalogue.
 */
export async function refreshItemEligibility(
  db: SqlExecutor,
  scope: Scope,
  rule: IntegrationEligibilityRule | null,
  externalIds?: string[]
): Promise<{ evaluated: number; changed: number; eligible: number }> {
  const params: unknown[] = [scope.seller_id, scope.provider_id]
  let only = ""
  if (externalIds) {
    only = ` AND external_id IN (SELECT jsonb_array_elements_text(?::jsonb))`
    params.push(JSON.stringify(externalIds))
  }

  const rows = (await db.execute(
    `SELECT external_id, is_active, status, attributes, is_eligible, eligibility_reason
      FROM integration_external_item
      WHERE seller_id = ? AND provider_id = ? AND deleted_at IS NULL${only}`,
    params
  )) as StagedRow[]

  let eligible = 0
  const changed: { external_id: string; is_eligible: boolean; eligibility_reason: string | null }[] = []
  for (const row of rows) {
    const result = evaluateEligibility(row, rule)
    eligible += result.is_eligible ? 1 : 0
    if (result.is_eligible !== row.is_eligible || result.reason !== row.eligibility_reason) {
      changed.push({
        external_id: row.external_id,
        is_eligible: result.is_eligible,
        eligibility_reason: result.reason,
      })
    }
  }

  if (changed.length) {
    await db.execute(
      `UPDATE integration_external_item i SET
          projection_pending = i.projection_pending OR i.is_eligible IS DISTINCT FROM x.is_eligible,
          is_eligible = x.is_eligible,
          eligibility_reason = x.eligibility_reason,
          updated_at = now()
        FROM jsonb_to_recordset(?::jsonb) AS x(external_id text, is_eligible boolean, eligibility_reason text)
        WHERE i.seller_id = ? AND i.provider_id = ? AND i.deleted_at IS NULL
          AND i.external_id = x.external_id`,
      [JSON.stringify(changed), scope.seller_id, scope.provider_id]
    )
  }

  return { evaluated: rows.length, changed: changed.length, eligible }
}
