/**
 * Store integrations: per-store connections to third-party systems
 * (POS/ERP, logistics, messaging, …). Each external system is implemented as a
 * provider of the `integration` module and registered in medusa-config, the
 * same way payment and payout providers are. Nothing here is specific to one
 * vendor; the vendor UI renders its forms from the provider's field
 * descriptors.
 */

export enum IntegrationCategory {
  POS_ERP = "pos_erp",
  LOGISTICS = "logistics",
  MESSAGING = "messaging",
  MARKETING = "marketing",
  OTHER = "other",
}

export enum StoreIntegrationStatus {
  /** Saved but never tested, or credentials changed since the last test. */
  UNTESTED = "untested",
  CONNECTED = "connected",
  ERROR = "error",
}

export type IntegrationFieldType =
  | "text"
  | "url"
  | "secret"
  | "number"
  | "boolean"
  | "select"

export interface IntegrationFieldOption {
  value: string
  label: string
}

/** Describes one form field; the vendor UI renders forms from these. */
export interface IntegrationFieldDefinition {
  key: string
  label: string
  type: IntegrationFieldType
  required?: boolean
  placeholder?: string
  help_text?: string
  /** Only for `select` fields. */
  options?: IntegrationFieldOption[]
  default_value?: string | number | boolean
}

export interface IntegrationProviderDefinition {
  title: string
  description: string
  category: IntegrationCategory
  logo_url?: string
  docs_url?: string
  /** Stored encrypted. `secret` fields are never returned unmasked. */
  credential_fields: IntegrationFieldDefinition[]
  /** Non-secret configuration, stored as plain JSON. */
  setting_fields?: IntegrationFieldDefinition[]
}

export type IntegrationValue = string | number | boolean | null

export type IntegrationValues = Record<string, IntegrationValue>

/** Optional abilities a provider implements beyond connecting. */
export enum IntegrationCapability {
  /** `listLocations`: outlets/warehouses that map to our stock locations. */
  LOCATIONS = "locations",
  /** `listItems`: product/item master, with per-location item data. */
  CATALOG = "catalog",
  /** `listPrices`: per-location prices. */
  PRICES = "prices",
  /** `listStock`: stock levels per item × location × lot. */
  STOCK = "stock",
}

export interface IntegrationProviderDTO extends IntegrationProviderDefinition {
  /** The provider id from medusa-config (`providers: [{ resolve, id }]`). */
  id: string
  capabilities: IntegrationCapability[]
}

export interface StoreIntegrationDTO {
  id: string
  seller_id: string
  provider_id: string
  label: string | null
  is_enabled: boolean
  status: StoreIntegrationStatus
  /** Secret fields are masked (e.g. `••••a1b2`); other fields are plain. */
  credentials: IntegrationValues
  settings: IntegrationValues
  last_checked_at: Date | null
  last_error: string | null
  updated_by: string | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
}

export interface IntegrationTestResult {
  ok: boolean
  message: string
  details?: Record<string, unknown>
}

export interface StoreIntegrationListItem {
  provider: IntegrationProviderDTO
  /** `null` when the store has not connected this provider. */
  connection: StoreIntegrationDTO | null
}

export interface UpsertStoreIntegrationDTO {
  seller_id: string
  provider_id: string
  label?: string | null
  is_enabled?: boolean
  /** Masked secret values mean "keep the stored value". */
  credentials?: IntegrationValues
  settings?: IntegrationValues
  actor_id?: string | null
}

/** A place in the external system (outlet, warehouse, hub) as a provider reports it. */
export interface ExternalLocation {
  /** Stable id in the external system, e.g. GoFrugal outletId. */
  external_id: string
  name: string
  code?: string | null
  address?: string | null
  city?: string | null
  /** Whether the external system reports it as active. */
  is_active: boolean
  raw?: Record<string, unknown> | null
}

export enum IntegrationLocationStatus {
  ACTIVE = "active",
  /** Reported inactive by the provider, or missing from its latest list. */
  INACTIVE = "inactive",
}

export interface IntegrationLocationDTO {
  id: string
  seller_id: string
  provider_id: string
  external_id: string
  name: string
  code: string | null
  address: string | null
  city: string | null
  status: IntegrationLocationStatus
  /** Mapped branch (stock location); null = not mapped. */
  stock_location_id: string | null
  stock_location: { id: string; name: string } | null
  last_seen_at: Date | null
  created_at: Date
  updated_at: Date
}

export enum IntegrationSyncStream {
  LOCATIONS = "locations",
  ITEMS = "items",
  PRICES = "prices",
  STOCK = "stock",
}

export enum IntegrationSyncTrigger {
  MANUAL = "manual",
  SCHEDULE = "schedule",
  CONNECT = "connect",
}

export enum IntegrationSyncRunStatus {
  RUNNING = "running",
  SUCCESS = "success",
  FAILED = "failed",
}

export interface IntegrationSyncRunDTO {
  id: string
  seller_id: string
  provider_id: string
  stream: IntegrationSyncStream
  trigger: IntegrationSyncTrigger
  status: IntegrationSyncRunStatus
  /** Stream-specific counts, e.g. { found, created, updated, deactivated }. */
  counts: Record<string, number> | null
  error: string | null
  started_at: Date
  finished_at: Date | null
}

/** Flat attribute values a provider reports (categories, flags, codes). */
export type ExternalAttributes = Record<string, string | number | boolean | null>

/**
 * Item data that differs per external location (outlet), from the items feed.
 * Prices (MRP, sale price, tax) come from the prices stream instead, so the two
 * feeds never overwrite each other.
 */
export interface ExternalItemLocation {
  location_external_id: string
  /** Location-level code for the item, e.g. GoFrugal itemReferenceCode. */
  sku?: string | null
  is_online?: boolean | null
  buffer_qty?: number | null
  /** Online-only price set in the external system, if any. */
  special_price?: number | null
  attributes?: ExternalAttributes | null
  raw?: Record<string, unknown> | null
}

/** An item (product master row) as a provider reports it. */
export interface ExternalItem {
  /** Stable id in the external system, e.g. GoFrugal itemId. */
  external_id: string
  name: string
  sku?: string | null
  barcode?: string | null
  /** Provider status code as-is (e.g. GoFrugal "R"/"N"); not interpreted in staging. */
  status?: string | null
  manufacturer?: string | null
  tax_rate?: number | null
  hsn_code?: string | null
  attributes?: ExternalAttributes | null
  locations?: ExternalItemLocation[]
  raw?: Record<string, unknown> | null
}

/** A per-location price row. Identify the item by external id or by sku. */
export interface ExternalItemPrice {
  item_external_id?: string | null
  /** Used when the provider keys prices by a code instead of the item id. */
  item_sku?: string | null
  location_external_id: string
  mrp?: number | null
  sale_price?: number | null
  original_price?: number | null
  tax_rate?: number | null
  raw?: Record<string, unknown> | null
}

/** Stock for one item × location × lot. `lot_key` groups batches (GoFrugal: MRP). */
export interface ExternalStockLevel {
  item_external_id: string
  location_external_id: string
  lot_key: string
  quantity: number
  mrp?: number | null
  raw?: Record<string, unknown> | null
}

export interface IntegrationPageRequest {
  /** Delta cursor from the last successful run; null = full pull. */
  cursor: string | null
  /** 1-based page number. */
  page: number
}

export interface IntegrationPage<T> {
  rows: T[]
  /** Next page number, or null when this was the last page. */
  next_page: number | null
  /** Highest change cursor seen on this page (e.g. GoFrugal itemTimeStamp). */
  max_cursor?: string | null
}

export interface IntegrationCatalogCount {
  value: string | null
  count: number
}

export interface IntegrationCatalogAttributePairs {
  keys: [string, string]
  rows: { values: [string | null, string | null]; count: number }[]
}

/** Counts over staged catalogue data, used to decide sync rules on real data. */
export interface IntegrationCatalogSummaryDTO {
  items: number
  active_items: number
  item_locations: number
  stock_rows: number
  /** Item × location pairs with more than one in-stock lot price (MRP). */
  multi_lot_price_pairs: number
  /** Item × location pairs whose sale price is above the lowest in-stock lot MRP. */
  sale_price_above_min_lot_mrp: number
  /** Sum of (highest − lowest) in-stock lot MRP over multi-lot pairs. */
  lot_price_spread_total: number
  by_status: IntegrationCatalogCount[]
  /** Top values per attribute key requested by the provider (e.g. Cat4, Cat6, itemTaxType). */
  by_attribute: Record<string, IntegrationCatalogCount[]>
  /** Counts per combination of two attributes, e.g. Cat6 × Cat4. */
  attribute_pairs: IntegrationCatalogAttributePairs | null
  last_runs: Partial<Record<IntegrationSyncStream, IntegrationSyncRunDTO | null>>
}
