import { z } from "zod"
import {
  createFindParams,
  createSelectParams,
} from "@medusajs/medusa/api/utils/validators"
import {
  StoreCommerceType,
  StoreFulfillmentMethod,
  StoreIndustry,
  StoreOrderStatusType,
  StoreStorefrontTemplate,
} from "@mercurjs/types"

export type VendorGetStoresParamsType = z.infer<typeof VendorGetStoresParams>
export const VendorGetStoresParams = createFindParams({
  offset: 0,
  limit: 50,
}).merge(
  z.object({
    q: z.string().optional(),
    industry: z.union([z.string(), z.array(z.string())]).optional(),
    commerce_type: z.union([z.string(), z.array(z.string())]).optional(),
    status: z.union([z.string(), z.array(z.string())]).optional(),
  })
)

export type VendorGetStoreParamsType = z.infer<typeof VendorGetStoreParams>
export const VendorGetStoreParams = createSelectParams()

const addressSchema = z.object({
  name: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  address_1: z.string().nullable().optional(),
  address_2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
})

const professionalDetailsSchema = z.object({
  corporate_name: z.string().nullable().optional(),
  registration_number: z.string().nullable().optional(),
  tax_id: z.string().nullable().optional(),
})

const paymentConfigSchema = z.object({
  online_enabled: z.boolean().optional(),
  payment_provider_id: z.string().nullable().optional(),
  cod_enabled: z.boolean().optional(),
  cod_min_amount: z.number().nullable().optional(),
  cod_max_amount: z.number().nullable().optional(),
  currency_code: z.string().nullable().optional(),
})

const orderStatusSchema = z.object({
  status: z.nativeEnum(StoreOrderStatusType),
  display_name: z.string(),
  color: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  is_required: z.boolean().optional(),
  rank: z.number().optional(),
})

// POST /vendor/store-onboarding — create a store (wizard step 1, draft).
export type VendorCreateStoreType = z.infer<typeof VendorCreateStore>
export const VendorCreateStore = z.object({
  // Seller (store) core fields — reused Mercur Seller.
  name: z.string(),
  handle: z.string().optional(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  currency_code: z.string(),
  // For an unregistered creator (no member yet).
  member_email: z.string().email().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  // Owner @handle (member_profile).
  owner_handle: z.string().optional(),
  // Step 1 — business details.
  industry: z.nativeEnum(StoreIndustry).nullable().optional(),
  address: addressSchema.optional(),
  professional_details: professionalDetailsSchema.optional(),
  // Step 2/4 may also be sent up front (all optional, wizard fills over time).
  commerce_type: z.nativeEnum(StoreCommerceType).nullable().optional(),
  fulfillment_methods: z.array(z.nativeEnum(StoreFulfillmentMethod)).nullable().optional(),
  storefront_template: z.nativeEnum(StoreStorefrontTemplate).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
})

// POST /vendor/store-onboarding/:id — update store_profile extension data
// (steps 2-4). Seller-native fields (name/address/professional) use the existing
// /vendor/sellers/:id endpoints.
// ---- Fulfillment centres (wizard step 3) ----------------------------------

const storeLocationAddressSchema = z.object({
  address_1: z.string(),
  address_2: z.string().nullish(),
  company: z.string().nullish(),
  city: z.string().nullish(),
  country_code: z.string(),
  province: z.string().nullish(),
  postal_code: z.string().nullish(),
  phone: z.string().nullish(),
})

export type VendorGetStoreLocationsParamsType = z.infer<
  typeof VendorGetStoreLocationsParams
>
export const VendorGetStoreLocationsParams = createFindParams({
  offset: 0,
  limit: 50,
})

// POST /vendor/store-onboarding/:id/locations
export type VendorCreateStoreLocationType = z.infer<
  typeof VendorCreateStoreLocation
>
export const VendorCreateStoreLocation = z.object({
  name: z.preprocess(
    (val: unknown) => (typeof val === "string" ? val.trim() : val),
    z.string().min(1)
  ),
  address: storeLocationAddressSchema.optional(),
  is_active: z.boolean().optional(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
})

// POST /vendor/store-onboarding/:id/locations/:location_id
export type VendorUpdateStoreLocationType = z.infer<
  typeof VendorUpdateStoreLocation
>
export const VendorUpdateStoreLocation = z.object({
  name: z.string().optional(),
  address: storeLocationAddressSchema.optional(),
  is_active: z.boolean().optional(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
})

export type VendorUpdateStoreType = z.infer<typeof VendorUpdateStore>
export const VendorUpdateStore = z.object({
  industry: z.nativeEnum(StoreIndustry).nullable().optional(),
  commerce_type: z.nativeEnum(StoreCommerceType).nullable().optional(),
  fulfillment_methods: z.array(z.nativeEnum(StoreFulfillmentMethod)).nullable().optional(),
  storefront_template: z.nativeEnum(StoreStorefrontTemplate).nullable().optional(),
  owner_handle: z.string().optional(),
  payment_config: paymentConfigSchema.optional(),
  order_statuses: z.array(orderStatusSchema).optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
})
