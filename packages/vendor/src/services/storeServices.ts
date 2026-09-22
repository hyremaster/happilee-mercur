import { fetchQuery } from "../lib/client";

export type StoreOnboardingRow = {
  id: string;
  object: "store" | "store_draft";
  is_draft: boolean;
  status: string;
  name: string | null;
  owner_handle: string | null;
  industry: string | null;
  commerce_type: string | null;
  handle?: string | null;
  draft_id?: string;
  onboarding_step?: number;
  created_at: string;
  updated_at: string;
};

export type StoreOnboardingListResponse = {
  stores: StoreOnboardingRow[];
  count: number;
  offset: number;
  limit: number;
};

export type ListStoresQuery = {
  offset?: number;
  limit?: number;
  q?: string;
  search?: string;
  industry?: string | string[];
  commerce_type?: string | string[];
  status?: string | string[];
};

export type StoreAddress = {
  address_1?: string | null;
  city?: string | null;
  country_code?: string | null;
  province?: string | null;
  postal_code?: string | null;
  phone?: string | null;
};

export type StoreProfessionalDetails = {
  corporate_name?: string | null;
  tax_id?: string | null;
};

export type StorePaymentConfig = {
  online_enabled?: boolean;
  payment_provider_id?: string | null;
  cod_enabled?: boolean;
  cod_min_amount?: number | null;
  cod_max_amount?: number | null;
  currency_code?: string | null;
};

export type StoreOrderStatus = {
  status: string;
  display_name: string;
  color?: string | null;
  is_active?: boolean;
  is_required?: boolean;
  rank?: number;
};

export type StoreProfile = {
  industry: string | null;
  commerce_type: string | null;
  fulfillment_methods: string[] | null;
  storefront_template: string | null;
  order_statuses?: StoreOrderStatus[] | null;
  payment_config?: StorePaymentConfig | null;
};

export type StoreDeliveryArea = {
  area_sense_id: string;
  area_name: string;
  metadata?: Record<string, unknown> | null;
};

export type StorePaymentGateway = {
  id?: string;
  gateway: string;
  label: string;
  is_active: boolean;
  credentials: {
    key_id?: string;
    key_secret?: string;
    webhook_secret?: string;
  };
  metadata?: {
    method_name?: string;
    client_id?: string;
  } | null;
};

export type StoreDetail = {
  id: string;
  name: string | null;
  handle: string | null;
  email: string | null;
  phone: string | null;
  address?: StoreAddress | null;
  professional_details?: StoreProfessionalDetails | null;
  store_profile?: StoreProfile | null;
  owner_handle?: string | null;
  delivery_areas?: StoreDeliveryArea[] | null;
  payment_gateways?: StorePaymentGateway[] | null;
};

export type StoreDetailResponse = {
  store: StoreDetail;
};

export type StoreLocationRow = {
  id: string;
  name: string | null;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
  address?: StoreAddress | null;
};

export type StoreLocationsResponse = {
  locations: StoreLocationRow[];
  count: number;
};

export type StoreLocationAddressPayload = {
  address_1?: string | null;
  city?: string | null;
  country_code?: string | null;
  province?: string | null;
  postal_code?: string | null;
  phone?: string | null;
};

export type CreateStoreLocationPayload = {
  name: string;
  address?: StoreLocationAddressPayload;
  is_active?: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

export type UpdateStoreLocationPayload = Partial<CreateStoreLocationPayload>;

export type StoreLocationResponse = {
  location: StoreLocationRow;
};

export type DeleteStoreLocationResponse = {
  id: string;
  object: "store_location";
  deleted: boolean;
};

const STORE_ONBOARDING_BASE = "/vendor/store-onboarding";

export const listStores = async (
  query?: ListStoresQuery,
): Promise<StoreOnboardingListResponse> => {
  return fetchQuery(STORE_ONBOARDING_BASE, {
    method: "GET",
    query,
  }) as Promise<StoreOnboardingListResponse>;
};

export const getStore = async (storeId: string): Promise<StoreDetailResponse> => {
  return fetchQuery(`${STORE_ONBOARDING_BASE}/${storeId}`, {
    method: "GET",
  }) as Promise<StoreDetailResponse>;
};

export const getStoreLocations = async (
  storeId: string,
): Promise<StoreLocationsResponse> => {
  return fetchQuery(`${STORE_ONBOARDING_BASE}/${storeId}/locations`, {
    method: "GET",
  }) as Promise<StoreLocationsResponse>;
};

export const createStoreLocation = async (
  storeId: string,
  body: CreateStoreLocationPayload,
): Promise<StoreLocationResponse> => {
  return fetchQuery(`${STORE_ONBOARDING_BASE}/${storeId}/locations`, {
    method: "POST",
    body,
  }) as Promise<StoreLocationResponse>;
};

export const updateStoreLocation = async (
  storeId: string,
  locationId: string,
  body: UpdateStoreLocationPayload,
): Promise<StoreLocationResponse> => {
  return fetchQuery(
    `${STORE_ONBOARDING_BASE}/${storeId}/locations/${locationId}`,
    {
      method: "POST",
      body,
    },
  ) as Promise<StoreLocationResponse>;
};

export const deleteStoreLocation = async (
  storeId: string,
  locationId: string,
): Promise<DeleteStoreLocationResponse> => {
  return fetchQuery(
    `${STORE_ONBOARDING_BASE}/${storeId}/locations/${locationId}`,
    {
      method: "DELETE",
    },
  ) as Promise<DeleteStoreLocationResponse>;
};
