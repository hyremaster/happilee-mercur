import { Context, InferTypeOf } from "@medusajs/framework/types"
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils"
import {
  ExternalItem,
  ExternalItemPrice,
  ExternalLocation,
  ExternalStockLevel,
  IntegrationCapability,
  IntegrationConnectionInput,
  IntegrationLocationDTO,
  IntegrationLocationStatus,
  IntegrationPage,
  IntegrationPageRequest,
  IntegrationProviderDTO,
  IntegrationSyncRunDTO,
  IntegrationSyncRunStatus,
  IntegrationSyncStream,
  IntegrationSyncTrigger,
  IntegrationTestResult,
  IntegrationValues,
  StoreIntegrationDTO,
  StoreIntegrationListItem,
  StoreIntegrationStatus,
  UpsertStoreIntegrationDTO,
} from "@mercurjs/types"

import { decryptJson, encryptJson } from "../../utils/secrets"
import {
  IntegrationExternalItem,
  IntegrationExternalItemLocation,
  IntegrationExternalStock,
  IntegrationLocation,
  IntegrationSyncCursor,
  IntegrationSyncRun,
  StoreIntegration,
} from "./models"
import IntegrationProviderService from "./services/integration-provider-service"
import {
  catalogSummary,
  CatalogSummaryCounts,
  deactivateUnseenItems,
  ItemsPageResult,
  PricesPageResult,
  SqlExecutor,
  StockPageResult,
  upsertItemsPage,
  upsertPricesPage,
  upsertStockPage,
  zeroUnseenStock,
} from "./utils/catalog-staging"
import {
  maskCredentialValues,
  mergeFieldValues,
  validateFieldValues,
} from "./utils/fields"

export type StoreIntegrationRow = InferTypeOf<typeof StoreIntegration>
export type IntegrationLocationRow = InferTypeOf<typeof IntegrationLocation>
export type IntegrationSyncRunRow = InferTypeOf<typeof IntegrationSyncRun>
export type IntegrationSyncCursorRow = InferTypeOf<typeof IntegrationSyncCursor>

type CatalogScope = { seller_id: string; provider_id: string }

/** Staging SQL runs on the module's MikroORM entity manager. */
const sqlOf = (manager: unknown): SqlExecutor => {
  if (!manager || typeof (manager as SqlExecutor).execute !== "function") {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Integration module has no SQL entity manager."
    )
  }
  return manager as SqlExecutor
}

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
  IntegrationLocation,
  IntegrationSyncRun,
  IntegrationExternalItem,
  IntegrationExternalItemLocation,
  IntegrationExternalStock,
  IntegrationSyncCursor,
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

  supportsCapability(providerId: string, capability: IntegrationCapability): boolean {
    return this.providerService_.supports(providerId, capability)
  }

  /**
   * Decrypted connection input for server-side syncs. Throws a clear error
   * when the store hasn't connected the provider, the connection is disabled,
   * or its credentials can't be read.
   */
  async requireConnectionInput(
    sellerId: string,
    providerId: string
  ): Promise<IntegrationConnectionInput> {
    const row = await this.retrieveSellerIntegration(sellerId, providerId)
    if (!row) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `This store hasn't connected "${providerId}".`
      )
    }
    if (!row.is_enabled) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `The "${providerId}" integration is disabled for this store.`
      )
    }
    return {
      credentials: this.decryptStoredCredentials(row),
      settings: (row.settings as IntegrationValues | null) ?? {},
    }
  }

  /** Ask the provider for its locations (read-only external call). */
  async fetchExternalLocations(
    providerId: string,
    input: IntegrationConnectionInput
  ): Promise<ExternalLocation[]> {
    const provider = this.providerService_.retrieve(providerId)
    if (typeof provider.listLocations !== "function") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Integration provider "${providerId}" doesn't support locations.`
      )
    }
    return provider.listLocations(input)
  }

  /** One page of the provider's items (read-only external call). */
  async fetchExternalItemsPage(
    providerId: string,
    input: IntegrationConnectionInput,
    request: IntegrationPageRequest
  ): Promise<IntegrationPage<ExternalItem>> {
    const provider = this.providerService_.retrieve(providerId)
    if (typeof provider.listItems !== "function") {
      throw this.unsupported(providerId, "a catalogue")
    }
    return provider.listItems(input, request)
  }

  /** One page of the provider's per-location prices (read-only external call). */
  async fetchExternalPricesPage(
    providerId: string,
    input: IntegrationConnectionInput,
    request: IntegrationPageRequest
  ): Promise<IntegrationPage<ExternalItemPrice>> {
    const provider = this.providerService_.retrieve(providerId)
    if (typeof provider.listPrices !== "function") {
      throw this.unsupported(providerId, "prices")
    }
    return provider.listPrices(input, request)
  }

  /** One page of the provider's stock snapshot (read-only external call). */
  async fetchExternalStockPage(
    providerId: string,
    input: IntegrationConnectionInput,
    request: IntegrationPageRequest
  ): Promise<IntegrationPage<ExternalStockLevel>> {
    const provider = this.providerService_.retrieve(providerId)
    if (typeof provider.listStock !== "function") {
      throw this.unsupported(providerId, "stock")
    }
    return provider.listStock(input, request)
  }

  /** Attribute keys the provider wants profiled in the catalogue summary. */
  catalogProfileKeys(providerId: string): string[] {
    const provider = this.providerService_.retrieve(providerId)
    return provider.getCatalogProfileKeys?.() ?? []
  }

  @InjectTransactionManager()
  async stageExternalItemsPage(
    scope: CatalogScope,
    items: ExternalItem[],
    now: Date,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<ItemsPageResult> {
    return upsertItemsPage(sqlOf(sharedContext.transactionManager), scope, items, now)
  }

  @InjectTransactionManager()
  async stageExternalPricesPage(
    scope: CatalogScope,
    prices: ExternalItemPrice[],
    now: Date,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<PricesPageResult> {
    return upsertPricesPage(sqlOf(sharedContext.transactionManager), scope, prices, now)
  }

  @InjectTransactionManager()
  async stageExternalStockPage(
    scope: CatalogScope,
    levels: ExternalStockLevel[],
    now: Date,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<StockPageResult> {
    return upsertStockPage(sqlOf(sharedContext.transactionManager), scope, levels, now)
  }

  /** After a complete full items pull. Returns the number deactivated. */
  @InjectTransactionManager()
  async deactivateUnseenExternalItems(
    scope: CatalogScope,
    before: Date,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<number> {
    return deactivateUnseenItems(sqlOf(sharedContext.transactionManager), scope, before)
  }

  /** After a complete stock snapshot. Returns the number of lots set to 0. */
  @InjectTransactionManager()
  async zeroUnseenExternalStock(
    scope: CatalogScope,
    before: Date,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<number> {
    return zeroUnseenStock(sqlOf(sharedContext.transactionManager), scope, before)
  }

  @InjectManager()
  async summarizeExternalCatalog(
    scope: CatalogScope,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<CatalogSummaryCounts> {
    return catalogSummary(
      sqlOf(sharedContext.manager),
      scope,
      this.providerService_.has(scope.provider_id)
        ? this.catalogProfileKeys(scope.provider_id)
        : []
    )
  }

  async retrieveSyncCursor(
    scope: CatalogScope,
    stream: IntegrationSyncStream
  ): Promise<IntegrationSyncCursorRow | null> {
    const [row] = (await this.listIntegrationSyncCursors({
      ...scope,
      stream,
    })) as IntegrationSyncCursorRow[]
    return row ?? null
  }

  /** Record a successful run: new cursor, and the full-pull time when it was one. */
  async saveSyncCursor(
    scope: CatalogScope,
    stream: IntegrationSyncStream,
    data: { cursor: string | null; full: boolean; at: Date }
  ): Promise<void> {
    const existing = await this.retrieveSyncCursor(scope, stream)
    const values = {
      cursor: data.cursor,
      last_success_at: data.at,
      ...(data.full ? { last_full_at: data.at } : {}),
    }
    if (existing) {
      await this.updateIntegrationSyncCursors({ id: existing.id, ...values })
    } else {
      await this.createIntegrationSyncCursors({ ...scope, stream, ...values })
    }
  }

  protected unsupported(providerId: string, what: string): MedusaError {
    return new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Integration provider "${providerId}" doesn't support ${what}.`
    )
  }

  toIntegrationLocationDTO(
    row: IntegrationLocationRow,
    stockLocations: Map<string, { id: string; name: string }> = new Map()
  ): IntegrationLocationDTO {
    return {
      id: row.id,
      seller_id: row.seller_id,
      provider_id: row.provider_id,
      external_id: row.external_id,
      name: row.name,
      code: row.code ?? null,
      address: row.address ?? null,
      city: row.city ?? null,
      status: row.status as IntegrationLocationStatus,
      stock_location_id: row.stock_location_id ?? null,
      stock_location: row.stock_location_id
        ? stockLocations.get(row.stock_location_id) ?? null
        : null,
      last_seen_at: row.last_seen_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  toSyncRunDTO(row: IntegrationSyncRunRow): IntegrationSyncRunDTO {
    return {
      id: row.id,
      seller_id: row.seller_id,
      provider_id: row.provider_id,
      stream: row.stream as IntegrationSyncStream,
      trigger: row.trigger as IntegrationSyncTrigger,
      status: row.status as IntegrationSyncRunStatus,
      counts: (row.counts as Record<string, number> | null) ?? null,
      error: row.error ?? null,
      started_at: row.started_at,
      finished_at: row.finished_at ?? null,
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
