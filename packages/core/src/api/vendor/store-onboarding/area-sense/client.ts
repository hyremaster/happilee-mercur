import { MedusaError } from "@medusajs/framework/utils"
import type { AreaSenseAreaDTO } from "@mercurjs/types"

/**
 * Thin client for the external Area Sense system (Happilee API).
 *   - AREASENSE_API_URL — base URL (e.g. https://devapi.happilee.io), env-driven.
 *   - x-api-key — the seller's `store_profile.happilee_api_key` (passed in by the
 *     route). Falls back to the AREASENSE_API_KEY env var when a seller/key is
 *     not available yet (e.g. during onboarding drafts).
 *
 * Endpoint: GET {base}/api/v1/listAreaSense?search=<q>
 * Response: { message, data: [{ id, area_name, area_type, delivery_type,
 *            is_active, ... }], total_count }
 * We keep only `id` -> area_sense_id and `area_name`, stashing the rest in
 * metadata for future use.
 */
type AreaSenseRawArea = {
  id?: string
  area_name?: string
  [key: string]: unknown
}

const mapArea = (raw: AreaSenseRawArea): AreaSenseAreaDTO => ({
  area_sense_id: raw.id ? String(raw.id) : "",
  area_name: raw.area_name ? String(raw.area_name) : "",
  metadata: raw,
})

export async function fetchAreaSenseAreas(
  query?: {
    search?: string
  },
  options?: {
    apiKey?: string | null
  }
): Promise<AreaSenseAreaDTO[]> {
  const baseUrl = process.env.AREASENSE_API_URL
  // Prefer the seller's store_profile key; fall back to env (onboarding drafts).
  const apiKey = options?.apiKey || process.env.AREASENSE_API_KEY

  if (!baseUrl || !apiKey) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Area Sense is not configured. Set the store's happilee_api_key (or the AREASENSE_API_KEY env var) and AREASENSE_API_URL."
    )
  }

  const url = new URL("/api/v1/listAreaSense", baseUrl)
  if (query?.search) {
    url.searchParams.set("search", query.search)
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
    })
  } catch (e) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Failed to reach Area Sense: ${(e as Error).message}`
    )
  }

  if (!response.ok) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Area Sense returned ${response.status}.`
    )
  }

  const body = (await response.json()) as { data?: AreaSenseRawArea[] }
  const rawAreas = Array.isArray(body.data) ? body.data : []

  return rawAreas.map(mapArea).filter((a) => a.area_sense_id && a.area_name)
}
