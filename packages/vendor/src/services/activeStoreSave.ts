import type {
  BusinessDetails,
  CommerceConfig,
  PaymentConfig,
  StorefrontConfig,
} from "../pages/onboard/_components/types";
import {
  mapBusinessDetailsToStep1Data,
  mapCommerceTypeToStep2Data,
  mapFulfillmentDetailsToStep3Data,
  mapStorefrontToStep4Data,
} from "../pages/onboard/_components/onboarding-mappers";
import { fetchQuery } from "../lib/client";

const STORE_ONBOARDING_BASE = "/vendor/store-onboarding";

const updateStoreProfile = async (
  storeId: string,
  body: Record<string, unknown>,
): Promise<void> => {
  await fetchQuery(`${STORE_ONBOARDING_BASE}/${storeId}`, {
    method: "POST",
    body,
  });
};

const updateSeller = async (
  storeId: string,
  body: Record<string, unknown>,
): Promise<void> => {
  await fetchQuery(`/vendor/sellers/${storeId}`, {
    method: "POST",
    body,
  });
};

const updateSellerAddress = async (
  storeId: string,
  body: Record<string, unknown>,
): Promise<void> => {
  await fetchQuery(`/vendor/sellers/${storeId}/address`, {
    method: "POST",
    body,
  });
};

const updateSellerProfessionalDetails = async (
  storeId: string,
  body: Record<string, unknown>,
): Promise<void> => {
  await fetchQuery(`/vendor/sellers/${storeId}/professional-details`, {
    method: "POST",
    body,
  });
};

const saveDeliveryAreas = async (
  storeId: string,
  areas: Array<{ area_sense_id: string; area_name: string }>,
): Promise<void> => {
  await fetchQuery(`${STORE_ONBOARDING_BASE}/${storeId}/delivery-areas`, {
    method: "POST",
    body: { areas },
  });
};

/** Step 1 — seller core fields, address, professional details, and industry only. */
export const saveActiveStoreStep1 = async (
  storeId: string,
  businessDetails: BusinessDetails,
): Promise<void> => {
  const stepData = mapBusinessDetailsToStep1Data(businessDetails);

  await updateSeller(storeId, {
    name: stepData.name,
    email: stepData.email,
    phone: stepData.phone ?? null,
  });

  if (stepData.address) {
    await updateSellerAddress(storeId, stepData.address);
  }

  if (stepData.professional_details) {
    await updateSellerProfessionalDetails(storeId, stepData.professional_details);
  }

  await updateStoreProfile(storeId, {
    industry: stepData.industry,
    ...(stepData.owner_handle ? { owner_handle: stepData.owner_handle } : {}),
  });
};

/** Step 2 — commerce type, fulfillment methods, order statuses, and delivery areas (local only). */
export const saveActiveStoreStep2 = async (
  storeId: string,
  commerce: CommerceConfig,
): Promise<void> => {
  const stepData = mapCommerceTypeToStep2Data(commerce);

  await updateStoreProfile(storeId, {
    commerce_type: stepData.commerce_type,
    fulfillment_methods: stepData.fulfillment_methods,
    order_statuses: stepData.order_statuses,
  });

  if (stepData.delivery_areas?.length) {
    await saveDeliveryAreas(storeId, stepData.delivery_areas);
  }
};

/** Step 3 — payment config only (locations are synced via location APIs). */
export const saveActiveStoreStep3 = async (
  storeId: string,
  payment: PaymentConfig,
): Promise<void> => {
  const stepData = mapFulfillmentDetailsToStep3Data([], payment);

  await updateStoreProfile(storeId, {
    payment_config: stepData.payment,
  });
};

/** Step 4 — storefront template and store handle only. */
export const saveActiveStoreStep4 = async (
  storeId: string,
  storefront: StorefrontConfig,
): Promise<void> => {
  const stepData = mapStorefrontToStep4Data(storefront);

  await updateStoreProfile(storeId, {
    storefront_template: stepData.storefront_template,
  });

  await updateSeller(storeId, {
    handle: stepData.handle,
  });
};
