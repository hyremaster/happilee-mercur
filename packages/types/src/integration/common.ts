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

export interface IntegrationProviderDTO extends IntegrationProviderDefinition {
  /** The provider id from medusa-config (`providers: [{ resolve, id }]`). */
  id: string
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
