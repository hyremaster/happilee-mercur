import {
  ExternalItem,
  ExternalItemPrice,
  ExternalLocation,
  ExternalStockLevel,
  IntegrationPage,
  IntegrationPageRequest,
  IntegrationProviderDefinition,
  IntegrationTestResult,
  IntegrationValues,
} from "./common"

export interface IntegrationConnectionInput {
  /** Decrypted credentials (never masked). */
  credentials: IntegrationValues
  settings: IntegrationValues
}

/**
 * Contract every integration provider implements. Providers are classes with
 * a static `identifier`, packaged with `ModuleProvider("integration", { services })`
 * and registered in medusa-config under the `integration` module.
 */
export interface IIntegrationProvider {
  getDefinition(): IntegrationProviderDefinition

  /**
   * Provider-specific validation beyond the generic field checks (required,
   * type). Throw a MedusaError (INVALID_DATA) to reject. Must not call the
   * external system.
   */
  validate?(input: IntegrationConnectionInput): Promise<void>

  /**
   * Check the credentials against the external system. Implementations must
   * only perform read-only calls.
   */
  testConnection(
    input: IntegrationConnectionInput
  ): Promise<IntegrationTestResult>

  /**
   * Optional (capability `locations`): every outlet / warehouse in the
   * external system, active or not. Read-only. Throw on failure; the sync
   * records the error and changes nothing.
   */
  listLocations?(input: IntegrationConnectionInput): Promise<ExternalLocation[]>

  /**
   * Optional (capability `catalog`): one page of items changed since
   * `cursor` (all items when null), with their per-location data. Read-only.
   */
  listItems?(
    input: IntegrationConnectionInput,
    request: IntegrationPageRequest
  ): Promise<IntegrationPage<ExternalItem>>

  /** Optional (capability `prices`): one page of per-location prices changed since `cursor`. */
  listPrices?(
    input: IntegrationConnectionInput,
    request: IntegrationPageRequest
  ): Promise<IntegrationPage<ExternalItemPrice>>

  /**
   * Optional (capability `stock`): one page of a full stock snapshot. The
   * cursor is ignored; lots missing from a complete snapshot are set to 0.
   */
  listStock?(
    input: IntegrationConnectionInput,
    request: IntegrationPageRequest
  ): Promise<IntegrationPage<ExternalStockLevel>>

  /**
   * Optional: attribute keys worth profiling in the catalogue summary
   * (e.g. ["Cat6", "Cat4", "itemTaxType"]); the first two are also crossed.
   */
  getCatalogProfileKeys?(): string[]
}
