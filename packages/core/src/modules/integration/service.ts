import { InferTypeOf } from "@medusajs/framework/types"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import {
  IntegrationConnectionInput,
  IntegrationProviderDTO,
  IntegrationTestResult,
  IntegrationValues,
  StoreIntegrationDTO,
  StoreIntegrationListItem,
  StoreIntegrationStatus,
  UpsertStoreIntegrationDTO,
} from "@mercurjs/types"

import { decryptJson, encryptJson } from "../../utils/secrets"
import { StoreIntegration } from "./models"
import IntegrationProviderService from "./services/integration-provider-service"
import {
  maskCredentialValues,
  mergeFieldValues,
  validateFieldValues,
} from "./utils/fields"

export type StoreIntegrationRow = InferTypeOf<typeof StoreIntegration>

export const UNREADABLE_CREDENTIALS_MESSAGE =
  "The encryption key changed or the data is corrupted. Re-enter them and save."

type InjectedDependencies = {
  integrationProviderService: IntegrationProviderService
}

/** Data ready to persist, plus the decrypted values for a connection test. */
export type PreparedStoreIntegration = {
  credentials: string
  settings: IntegrationValues
  plain: IntegrationConnectionInput
  credentials_changed: boolean
}

class IntegrationModuleService extends MedusaService({
  StoreIntegration,
}) {
  protected readonly providerService_: IntegrationProviderService

  constructor({ integrationProviderService }: InjectedDependencies) {
    // @ts-ignore
    super(...arguments)
    this.providerService_ = integrationProviderService
  }

  listIntegrationProviders(): IntegrationProviderDTO[] {
    return this.providerService_.list()
  }

  retrieveIntegrationProvider(providerId: string): IntegrationProviderDTO {
    return this.providerService_.describe(providerId)
  }

  async retrieveSellerIntegration(
    sellerId: string,
    providerId: string
  ): Promise<StoreIntegrationRow | null> {
    const [row] = await this.listStoreIntegrations({
      seller_id: sellerId,
      provider_id: providerId,
    })
    return (row as StoreIntegrationRow | undefined) ?? null
  }

  /** Every configured provider, with this store's connection (masked) if any. */
  async listSellerIntegrations(
    sellerId: string
  ): Promise<StoreIntegrationListItem[]> {
    const rows = (await this.listStoreIntegrations({
      seller_id: sellerId,
    })) as StoreIntegrationRow[]
    const byProvider = new Map(rows.map((row) => [row.provider_id, row]))

    return this.providerService_.list().map((provider) => {
      const row = byProvider.get(provider.id)
      return {
        provider,
        connection: row ? this.toStoreIntegrationDTO(row) : null,
      }
    })
  }

  async retrieveSellerIntegrationItem(
    sellerId: string,
    providerId: string
  ): Promise<StoreIntegrationListItem> {
    const provider = this.providerService_.describe(providerId)
    const row = await this.retrieveSellerIntegration(sellerId, providerId)
    return {
      provider,
      connection: row ? this.toStoreIntegrationDTO(row) : null,
    }
  }

  /**
   * Decrypt a row's credentials without throwing. `readable: false` means the
   * ciphertext can't be decrypted: INTEGRATION_ENCRYPTION_KEY changed since it
   * was saved, or the stored value was altered. Such a row must be re-entered.
   */
  readStoredCredentials(row: Pick<StoreIntegrationRow, "credentials">): {
    values: IntegrationValues
    readable: boolean
  } {
    if (!row.credentials) {
      return { values: {}, readable: true }
    }
    try {
      return { values: decryptJson<IntegrationValues>(row.credentials), readable: true }
    } catch {
      return { values: {}, readable: false }
    }
  }

  /** Decrypt a row's credentials; throws a clear error when they're unreadable. */
  decryptStoredCredentials(
    row: Pick<StoreIntegrationRow, "credentials" | "provider_id" | "seller_id">
  ): IntegrationValues {
    const { values, readable } = this.readStoredCredentials(row)
    if (!readable) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Stored "${row.provider_id}" credentials for store ${row.seller_id} can't be read. ${UNREADABLE_CREDENTIALS_MESSAGE}`
      )
    }
    return values
  }

  /**
   * Decrypted credentials + settings for internal use (sync jobs). Returns
   * null when the store has no enabled connection for the provider. Never
   * expose the result over HTTP.
   */
  async getConnectionInput(
    sellerId: string,
    providerId: string
  ): Promise<IntegrationConnectionInput | null> {
    const row = await this.retrieveSellerIntegration(sellerId, providerId)
    if (!row || !row.is_enabled) {
      return null
    }
    return {
      credentials: this.decryptStoredCredentials(row),
      settings: (row.settings as IntegrationValues | null) ?? {},
    }
  }

  /**
   * Merge incoming values over the stored row (masked secrets keep their stored
   * value), validate against the provider's field descriptors and the provider's
   * own `validate`, and encrypt the credentials.
   */
  async prepareStoreIntegration(
    input: UpsertStoreIntegrationDTO,
    existing: StoreIntegrationRow | null
  ): Promise<PreparedStoreIntegration> {
    const definition = this.providerService_.describe(input.provider_id)
    const provider = this.providerService_.retrieve(input.provider_id)

    // Unreadable stored credentials (key changed) count as absent: the caller
    // must re-enter every required value, masked placeholders included.
    const stored = existing
      ? this.readStoredCredentials(existing)
      : { values: {}, readable: true }
    const storedCredentials = stored.values
    const storedSettings = (existing?.settings as IntegrationValues | null) ?? {}

    const credentials = mergeFieldValues(
      definition.credential_fields,
      input.credentials,
      storedCredentials
    )
    const settings = mergeFieldValues(
      definition.setting_fields ?? [],
      input.settings,
      storedSettings
    )

    validateFieldValues(definition.credential_fields, credentials, "credentials")
    validateFieldValues(definition.setting_fields ?? [], settings, "settings")

    const plain = { credentials, settings }
    if (provider.validate) {
      await provider.validate(plain)
    }

    const credentialsChanged =
      JSON.stringify(credentials) !== JSON.stringify(storedCredentials)

    return {
      credentials: encryptJson(credentials),
      settings,
      plain,
      credentials_changed: !existing || !stored.readable || credentialsChanged,
    }
  }

  /**
   * Run the provider's read-only connection test. Provider exceptions become a
   * failed result so callers can record them as the connection status.
   */
  async testIntegrationConnection(
    providerId: string,
    input: IntegrationConnectionInput
  ): Promise<IntegrationTestResult> {
    const provider = this.providerService_.retrieve(providerId)
    try {
      return await provider.testConnection(input)
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Connection test failed.",
      }
    }
  }

  toStoreIntegrationDTO(row: StoreIntegrationRow): StoreIntegrationDTO {
    const fields = this.providerService_.has(row.provider_id)
      ? this.providerService_.describe(row.provider_id).credential_fields
      : []
    const stored = this.readStoredCredentials(row)

    return {
      id: row.id,
      seller_id: row.seller_id,
      provider_id: row.provider_id,
      label: row.label ?? null,
      is_enabled: row.is_enabled,
      status: stored.readable
        ? (row.status as StoreIntegrationStatus)
        : StoreIntegrationStatus.ERROR,
      credentials: maskCredentialValues(fields, stored.values),
      settings: (row.settings as IntegrationValues | null) ?? {},
      last_checked_at: row.last_checked_at ?? null,
      last_error: stored.readable
        ? row.last_error ?? null
        : `Stored credentials can't be read. ${UNREADABLE_CREDENTIALS_MESSAGE}`,
      updated_by: row.updated_by ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}

export default IntegrationModuleService
