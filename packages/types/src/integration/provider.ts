import {
  ExternalLocation,
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
}
