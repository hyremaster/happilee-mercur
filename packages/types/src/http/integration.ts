import {
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
