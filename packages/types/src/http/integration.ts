import {
  IntegrationCatalogSummaryDTO,
  IntegrationLocationDTO,
  IntegrationSyncRunDTO,
  IntegrationTestResult,
  IntegrationValues,
  StoreIntegrationListItem,
} from "../integration"

export type VendorIntegrationListResponse = {
  integrations: StoreIntegrationListItem[]
}

export type VendorIntegrationResponse = {
  integration: StoreIntegrationListItem
}

export type VendorIntegrationSaveResponse = {
  integration: StoreIntegrationListItem
  /** Present when the save also ran a connection test. */
  test_result: IntegrationTestResult | null
}

export type VendorIntegrationTestResponse = {
  test_result: IntegrationTestResult
}

export type VendorIntegrationDeleteResponse = {
  id: string
  object: "store_integration"
  deleted: true
}

export type VendorSaveIntegrationBody = {
  label?: string | null
  is_enabled?: boolean
  credentials?: IntegrationValues
  settings?: IntegrationValues
  /** Run a connection test after saving (default true). */
  test?: boolean
}

export type VendorTestIntegrationBody = {
  credentials?: IntegrationValues
  settings?: IntegrationValues
}

export type VendorIntegrationLocationListResponse = {
  locations: IntegrationLocationDTO[]
  /** Latest locations sync run, if any. */
  last_run: IntegrationSyncRunDTO | null
}

export type VendorIntegrationLocationSyncResponse = {
  run: IntegrationSyncRunDTO
  locations: IntegrationLocationDTO[]
}

/**
 * POST /vendor/integrations/:provider_id/sync. `locations` runs inline (200,
 * with the refreshed locations); catalogue streams run in the background
 * (202, run status `running`).
 */
export type VendorIntegrationSyncResponse = {
  run: IntegrationSyncRunDTO
  locations?: IntegrationLocationDTO[]
}

export type VendorIntegrationCatalogSummaryResponse = {
  summary: IntegrationCatalogSummaryDTO
}

export type VendorIntegrationLocationResponse = {
  location: IntegrationLocationDTO
}

export type VendorUpdateIntegrationLocationBody = {
  /** Branch (stock location) to map to; null unmaps. */
  stock_location_id: string | null
}

export type VendorIntegrationSyncRunListResponse = {
  sync_runs: IntegrationSyncRunDTO[]
}
