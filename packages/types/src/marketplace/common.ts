export enum StorePaymentGatewayType {
  RAZORPAY = "razorpay",
}

export enum StoreIndustry {
  RESTAURANT = "restaurant",
  GROCERY = "grocery",
  FASHION = "fashion",
  ELECTRONICS = "electronics",
  BEAUTY = "beauty",
  BAKERY = "bakery",
  PHARMACY = "pharmacy",
  OTHER = "other",
}

export enum StoreCommerceType {
  LOCAL_DELIVERY = "local_delivery",
  ECOMMERCE_SHIPPING = "ecommerce_shipping",
}

/**
 * How a store fulfills orders (wizard step 2, multi-select).
 * Local delivery offers DELIVERY + PICKUP; ecommerce shipping offers
 * SHIPPING + PICKUP. PICKUP is shared by both commerce types.
 */
export enum StoreFulfillmentMethod {
  DELIVERY = "delivery",
  PICKUP = "pickup",
  SHIPPING = "shipping",
}

/** Lifecycle of a store-onboarding draft (wizard in progress vs materialized). */
export enum StoreOnboardingDraftStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
}

/** Standard order-status keys configurable per store (wizard step 2). */
export enum StoreOrderStatusType {
  ORDER_PLACED = "order_placed",
  CONFIRMED = "confirmed",
  PREPARING = "preparing",
  READY_FOR_PICKUP = "ready_for_pickup",
  OUT_FOR_DELIVERY = "out_for_delivery",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
}

export interface StoreProfileDTO {
  id: string
  seller_id: string
  industry: string | null
  commerce_type: string | null
  fulfillment_methods: string[] | null
  storefront_template: string | null
  payment_config?: StorePaymentConfigDTO | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateStoreProfileDTO {
  seller_id: string
  industry?: StoreIndustry | null
  commerce_type?: StoreCommerceType | null
  fulfillment_methods?: StoreFulfillmentMethod[] | null
  storefront_template?: string | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateStoreProfileDTO {
  seller_id?: string
  industry?: StoreIndustry | null
  commerce_type?: StoreCommerceType | null
  fulfillment_methods?: StoreFulfillmentMethod[] | null
  storefront_template?: string | null
  metadata?: Record<string, unknown> | null
}

export interface StorefrontTemplateDTO {
  id: string
  name: string
  key: string
  description: string | null
  preview_image_url: string | null
  is_active: boolean
  rank: number
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateStorefrontTemplateDTO {
  name: string
  key: string
  description?: string | null
  preview_image_url?: string | null
  is_active?: boolean
  rank?: number
}

export interface UpdateStorefrontTemplateDTO {
  name?: string
  key?: string
  description?: string | null
  preview_image_url?: string | null
  is_active?: boolean
  rank?: number
}

export interface StoreOrderStatusDTO {
  id: string
  store_profile_id: string
  status: string
  display_name: string
  color: string | null
  is_active: boolean
  is_required: boolean
  rank: number
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateStoreOrderStatusDTO {
  store_profile_id: string
  status: StoreOrderStatusType
  display_name: string
  color?: string | null
  is_active?: boolean
  is_required?: boolean
  rank?: number
  metadata?: Record<string, unknown> | null
}

export interface UpdateStoreOrderStatusDTO {
  status?: StoreOrderStatusType
  display_name?: string
  color?: string | null
  is_active?: boolean
  is_required?: boolean
  rank?: number
  metadata?: Record<string, unknown> | null
}

/**
 * Terminal store order statuses — once an order reaches one of these it cannot
 * transition to any other status. `getAllowedNextStatuses` returns [] for these.
 */
export const TERMINAL_STORE_ORDER_STATUSES: StoreOrderStatusType[] = [
  StoreOrderStatusType.DELIVERED,
  StoreOrderStatusType.CANCELLED,
]

/**
 * Append-only history of an order's marketplace status changes. The current
 * status of an order is the `status` of its most recent event; the full list
 * powers the timeline on the vendor order details page. `order_id`/`seller_id`
 * are plain cross-module text references (no defineLink), matching the rest of
 * the marketplace_profile module.
 */
export interface StoreOrderStatusEventDTO {
  id: string
  order_id: string
  seller_id: string
  status: string
  changed_by: string | null
  note: string | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateStoreOrderStatusEventDTO {
  order_id: string
  seller_id: string
  status: StoreOrderStatusType
  changed_by?: string | null
  note?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Per-order marketplace extension (1:1 with a Medusa order). Holds
 * denormalized columns the marketplace layer adds on top of the native order —
 * currently the `current_status` (kept in sync with the latest
 * StoreOrderStatusEvent) so list/filter views read one indexed row per order
 * instead of scanning the append-only history. Future marketplace-specific
 * order columns live here too. `order_id`/`seller_id` are plain text
 * cross-module references (no defineLink).
 */
export interface OrderExtensionDTO {
  id: string
  order_id: string
  seller_id: string
  current_status: string
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateOrderExtensionDTO {
  order_id: string
  seller_id: string
  current_status: StoreOrderStatusType
  metadata?: Record<string, unknown> | null
}

export interface UpdateOrderExtensionDTO {
  current_status?: StoreOrderStatusType
  metadata?: Record<string, unknown> | null
}

/**
 * Canonical order-status rows seeded per store on creation, and the target of
 * the "Reset to defaults" action. Required rows (order_placed, delivered,
 * cancelled) are always active and cannot be toggled off in the UI.
 */
export const DEFAULT_STORE_ORDER_STATUSES: Array<{
  status: StoreOrderStatusType
  display_name: string
  color: string
  is_active: boolean
  is_required: boolean
  rank: number
}> = [
  { status: StoreOrderStatusType.ORDER_PLACED, display_name: "Order placed", color: "#2563EB", is_active: true, is_required: true, rank: 0 },
  { status: StoreOrderStatusType.CONFIRMED, display_name: "Confirmed", color: "#16A34A", is_active: true, is_required: false, rank: 1 },
  { status: StoreOrderStatusType.PREPARING, display_name: "Preparing", color: "#F59E0B", is_active: true, is_required: false, rank: 2 },
  { status: StoreOrderStatusType.READY_FOR_PICKUP, display_name: "Ready for pickup", color: "#9333EA", is_active: true, is_required: false, rank: 3 },
  { status: StoreOrderStatusType.OUT_FOR_DELIVERY, display_name: "Out for delivery", color: "#2563EB", is_active: true, is_required: false, rank: 4 },
  { status: StoreOrderStatusType.DELIVERED, display_name: "Delivered", color: "#16A34A", is_active: true, is_required: true, rank: 5 },
  { status: StoreOrderStatusType.CANCELLED, display_name: "Cancelled", color: "#DC2626", is_active: true, is_required: true, rank: 6 },
]

/**
 * Wizard step 3 — per-location extras layered on a Medusa StockLocation.
 * The location itself (name, address, city/state/pincode/country) lives in the
 * native Medusa StockLocation (already seller-scoped by Mercur). This table only
 * holds the fields Medusa lacks: active toggle + map pin coordinates.
 * `stock_location_id` is a plain text cross-module reference.
 */
export interface StoreLocationDetailDTO {
  id: string
  stock_location_id: string
  is_active: boolean
  latitude: number | null
  longitude: number | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateStoreLocationDetailDTO {
  stock_location_id: string
  is_active?: boolean
  latitude?: number | null
  longitude?: number | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateStoreLocationDetailDTO {
  stock_location_id?: string
  is_active?: boolean
  latitude?: number | null
  longitude?: number | null
  metadata?: Record<string, unknown> | null
}

/**
 * Wizard step 3 — per-store payment configuration (1:1 with store_profile).
 * Online + COD can both be enabled. `payment_provider_id` is the chosen Medusa
 * payment provider for online payments. COD amounts use the store currency.
 */
export interface StorePaymentConfigDTO {
  id: string
  store_profile_id: string
  online_enabled: boolean
  payment_provider_id: string | null
  cod_enabled: boolean
  cod_min_amount: number | null
  cod_max_amount: number | null
  currency_code: string | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateStorePaymentConfigDTO {
  store_profile_id: string
  online_enabled?: boolean
  payment_provider_id?: string | null
  cod_enabled?: boolean
  cod_min_amount?: number | null
  cod_max_amount?: number | null
  currency_code?: string | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateStorePaymentConfigDTO {
  online_enabled?: boolean
  payment_provider_id?: string | null
  cod_enabled?: boolean
  cod_min_amount?: number | null
  cod_max_amount?: number | null
  currency_code?: string | null
  metadata?: Record<string, unknown> | null
}

export interface StorePaymentGatewayDTO {
  id: string
  seller_id: string
  gateway: StorePaymentGatewayType
  is_active: boolean
  credentials: { key_id: string; key_secret: string; webhook_secret?: string }
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateStorePaymentGatewayDTO {
  seller_id: string
  gateway: StorePaymentGatewayType
  is_active?: boolean
  credentials: { key_id: string; key_secret: string; webhook_secret?: string }
  metadata?: Record<string, unknown> | null
}

export interface UpdateStorePaymentGatewayDTO {
  is_active?: boolean
  credentials?: { key_id?: string; key_secret?: string; webhook_secret?: string }
  metadata?: Record<string, unknown> | null
}

/**
 * A delivery area a store serves (wizard step 2, Local delivery). Areas are
 * sourced from the external Area Sense system (via OpenAPI) and persisted here
 * so the marketplace keeps its own copy for future use. Seller-scoped standalone
 * table (plain `seller_id` ref, no defineLink) — mirrors StorePaymentGateway.
 */
export interface StoreDeliveryAreaDTO {
  id: string
  seller_id: string
  area_sense_id: string
  area_name: string
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateStoreDeliveryAreaDTO {
  seller_id: string
  area_sense_id: string
  area_name: string
  metadata?: Record<string, unknown> | null
}

export interface UpdateStoreDeliveryAreaDTO {
  area_sense_id?: string
  area_name?: string
  metadata?: Record<string, unknown> | null
}

/** Shape returned by the Area Sense proxy (one available external area). */
export interface AreaSenseAreaDTO {
  area_sense_id: string
  area_name: string
  metadata?: Record<string, unknown> | null
}

export interface MemberProfileDTO {
  id: string
  member_id: string
  handle: string
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateMemberProfileDTO {
  member_id: string
  handle: string
  metadata?: Record<string, unknown> | null
}

export interface UpdateMemberProfileDTO {
  member_id?: string
  handle?: string
  metadata?: Record<string, unknown> | null
}

/**
 * In-progress store-onboarding wizard, persisted per owner member. Holds all
 * screen payloads (incl. locations) in `draft_data` plus the resume pointer
 * `onboarding_step`. No Seller/StockLocation exist until the draft is submitted.
 */
export interface StoreOnboardingDraftDTO {
  id: string
  auth_identity_id: string
  draft_data: Record<string, unknown> | null
  onboarding_step: number
  status: string
  submitted_seller_id: string | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CreateStoreOnboardingDraftDTO {
  auth_identity_id: string
  draft_data?: Record<string, unknown> | null
  onboarding_step?: number
  status?: StoreOnboardingDraftStatus
  submitted_seller_id?: string | null
  metadata?: Record<string, unknown> | null
}

export interface UpdateStoreOnboardingDraftDTO {
  draft_data?: Record<string, unknown> | null
  onboarding_step?: number
  status?: StoreOnboardingDraftStatus
  submitted_seller_id?: string | null
  metadata?: Record<string, unknown> | null
}
