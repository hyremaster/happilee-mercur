import type {
  BusinessDetails,
  CommerceConfig,
  FulfillmentCentre,
  PaymentConfig,
  StorefrontConfig,
} from "../pages/onboard/_components/types";
import {
  mapBusinessDetailsToStep1Data,
  mapCommerceTypeToStep2Data,
  mapFulfillmentDetailsToStep3Data,
  mapOrderStatusesToApi,
  mapStorefrontToStep4Data,
} from "../pages/onboard/_components/onboarding-mappers";
import { fetchQuery } from "../lib/client";
import type { StoreLocationRow } from "./storeServices";

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

const createStoreLocation = async (
  storeId: string,
  body: Record<string, unknown>,
): Promise<StoreLocationRow> => {
  const response = (await fetchQuery(
    `${STORE_ONBOARDING_BASE}/${storeId}/locations`,
    {
      method: "POST",
      body,
    },
  )) as { location: StoreLocationRow };

  return response.location;
};

const updateStoreLocation = async (
  storeId: string,
  locationId: string,
  body: Record<string, unknown>,
): Promise<void> => {
  await fetchQuery(
    `${STORE_ONBOARDING_BASE}/${storeId}/locations/${locationId}`,
    {
      method: "POST",
      body,
    },
  );
};

const deleteStoreLocation = async (
  storeId: string,
  locationId: string,
): Promise<void> => {
  await fetchQuery(
    `${STORE_ONBOARDING_BASE}/${storeId}/locations/${locationId}`,
    {
      method: "DELETE",
    },
  );
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
    order_statuses: mapOrderStatusesToApi(commerce.orderStatuses),
  });

  if (stepData.delivery_areas?.length) {
    await saveDeliveryAreas(storeId, stepData.delivery_areas);
  }
};

/** Step 3 — payment config and fulfillment centre sync only. */
export const saveActiveStoreStep3 = async (
  storeId: string,
  centres: FulfillmentCentre[],
  payment: PaymentConfig,
  initialLocationIds: string[],
): Promise<string[]> => {
  const stepData = mapFulfillmentDetailsToStep3Data(centres, payment);

  await updateStoreProfile(storeId, {
    payment_config: stepData.payment,
  });

  const currentPersistedIds = centres
    .map((centre) => centre.id)
    .filter((id) => initialLocationIds.includes(id));

  const removedIds = initialLocationIds.filter(
    (id) => !currentPersistedIds.includes(id),
  );

  await Promise.all(
    removedIds.map((locationId) => deleteStoreLocation(storeId, locationId)),
  );

  const nextLocationIds: string[] = [];

  for (let index = 0; index < centres.length; index += 1) {
    const centre = centres[index];
    const locationPayload = stepData.locations[index];

    if (!locationPayload) {
      continue;
    }

    if (initialLocationIds.includes(centre.id)) {
      await updateStoreLocation(storeId, centre.id, {
        name: locationPayload.name,
        address: locationPayload.address,
        is_active: locationPayload.is_active,
        latitude: locationPayload.latitude,
        longitude: locationPayload.longitude,
      });
      nextLocationIds.push(centre.id);
      continue;
    }

    const created = await createStoreLocation(storeId, {
      name: locationPayload.name,
      address: locationPayload.address,
      is_active: locationPayload.is_active,
      latitude: locationPayload.latitude,
      longitude: locationPayload.longitude,
    });

    nextLocationIds.push(created.id);
  }

  return nextLocationIds;
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
