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

/**
 * One location to test against one Area Sense area. Supply coordinates OR a
 * zipcode (coordinates preferred). `area_id` is the Area Sense id
 * (`store_delivery_area.area_sense_id`).
 */
export type AreaSenseLocationInput = {
  area_id: string
  latitude?: number
  longitude?: number
  zipcode?: string
}

/** Per-area serviceability verdict returned by checkLocation. */
export type AreaSenseLocationResult = {
  area_id: string
  is_deliverable: boolean
  area_type?: string
  message?: string
}

type AreaSenseCheckLocationRaw = {
  area_id?: string | number
  error?: boolean
  is_deliverable?: boolean
  area_type?: string
  message?: string
}

/**
 * Ask Area Sense whether a location falls inside each of the given areas.
 *
 * POST {base}/api/v1/checkLocation
 *   body: { areas: [{ area_id, latitude, longitude } | { area_id, zipcode }] }
 *   resp: { error, data: [{ area_id, error, is_deliverable, area_type, message }] }
 *
 * Returns one result per area; `is_deliverable` is true only when the area
 * itself reported no error and `is_deliverable === true`. Same key resolution
 * as {@link fetchAreaSenseAreas}: seller's `store_profile.happilee_api_key`,
 * falling back to the AREASENSE_API_KEY env var.
 */
export async function checkAreaSenseLocation(
  areas: AreaSenseLocationInput[],
  options?: {
    apiKey?: string | null
  }
): Promise<AreaSenseLocationResult[]> {
  const baseUrl = process.env.AREASENSE_API_URL
  const apiKey = options?.apiKey || process.env.AREASENSE_API_KEY

  if (!baseUrl || !apiKey) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Area Sense is not configured. Set the store's happilee_api_key (or the AREASENSE_API_KEY env var) and AREASENSE_API_URL."
    )
  }

  if (!areas.length) {
    return []
  }

  const url = new URL("/api/v1/checkLocation", baseUrl)

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ areas }),
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

  const body = (await response.json()) as {
    data?: AreaSenseCheckLocationRaw[]
  }
  const rows = Array.isArray(body.data) ? body.data : []

  return rows
    .filter((r) => r.area_id !== undefined && r.area_id !== null)
    .map((r) => ({
      area_id: String(r.area_id),
      is_deliverable: r.error !== true && r.is_deliverable === true,
      area_type: r.area_type,
      message: r.message,
    }))
}
