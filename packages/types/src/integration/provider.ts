import {
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
}
