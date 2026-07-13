import type {
  BusinessDetails,
  CommerceConfig,
  PaymentConfig,
  StorefrontConfig,
  StoreSetupState,
} from "../pages/onboard/_components/types";
import {
  mapBusinessDetailsToStep1Data,
  mapCommerceTypeToStep2Data,
  mapFulfillmentDetailsToStep3Data,
  mapOrderStatusesToApi,
  mapStorefrontToStep4Data,
} from "../pages/onboard/_components/onboarding-mappers";
import { fetchQuery } from "../lib/client";

const STORE_ONBOARDING_BASE = "/vendor/store-onboarding";

/** UI-shaped baseline loaded when opening an active store for edit. */
export type ActiveStoreBaseline = {
  businessDetails: BusinessDetails;
  commerce: CommerceConfig;
  payment: PaymentConfig;
  storefront: StorefrontConfig;
};

export const createActiveStoreBaseline = (
  state: StoreSetupState,
): ActiveStoreBaseline => ({
  businessDetails: { ...state.businessDetails },
  commerce: {
    ...state.commerce,
    localFulfillment: [...state.commerce.localFulfillment],
    ecomFulfillment: [...state.commerce.ecomFulfillment],
    orderStatuses: state.commerce.orderStatuses.map((status) => ({ ...status })),
  },
  payment: {
    ...state.payment,
    methods: [...state.payment.methods],
  },
  storefront: { ...state.storefront },
});

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
};

const areEqual = (left: unknown, right: unknown): boolean =>
  stableSerialize(left) === stableSerialize(right);

export type VendorUpdateStorePayload = {
  name?: string;
  email?: string;
  phone?: string | null;
  description?: string | null;
  address?: Record<string, unknown>;
  professional_details?: Record<string, unknown>;
  industry?: string | null;
  commerce_type?: string | null;
  fulfillment_methods?: string[] | null;
  storefront_template?: string | null;
  owner_handle?: string;
  payment_config?: Record<string, unknown>;
  order_statuses?: ReturnType<typeof mapOrderStatusesToApi>;
  metadata?: Record<string, unknown> | null;
};

const updateStoreProfile = async (
  storeId: string,
  body: VendorUpdateStorePayload,
): Promise<void> => {
  await fetchQuery(`${STORE_ONBOARDING_BASE}/${storeId}`, {
    method: "POST",
    body,
  });
};

const updateSellerHandle = async (
  storeId: string,
  handle: string,
): Promise<void> => {
  await fetchQuery(`/vendor/sellers/${storeId}`, {
    method: "POST",
    body: { handle },
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

const buildStep1ProfilePatch = (
  current: BusinessDetails,
  baseline: BusinessDetails,
): VendorUpdateStorePayload => {
  const currentData = mapBusinessDetailsToStep1Data(current);
  const baselineData = mapBusinessDetailsToStep1Data(baseline);
  const patch: VendorUpdateStorePayload = {};

  if (currentData.name !== baselineData.name) {
    patch.name = currentData.name;
  }
  if (currentData.email !== baselineData.email) {
    patch.email = currentData.email;
  }
  if ((currentData.phone ?? null) !== (baselineData.phone ?? null)) {
    patch.phone = currentData.phone ?? null;
  }
  if (currentData.industry !== baselineData.industry) {
    patch.industry = currentData.industry;
  }
  if (
    (currentData.owner_handle ?? undefined) !==
    (baselineData.owner_handle ?? undefined)
  ) {
    if (currentData.owner_handle) {
      patch.owner_handle = currentData.owner_handle;
    }
  }
  if (!areEqual(currentData.address, baselineData.address)) {
    patch.address = currentData.address as unknown as Record<string, unknown>;
  }
  if (
    !areEqual(
      currentData.professional_details ?? null,
      baselineData.professional_details ?? null,
    )
  ) {
    patch.professional_details = (currentData.professional_details ?? {
      corporate_name: null,
      tax_id: null,
    }) as unknown as Record<string, unknown>;
  }

  return patch;
};

const buildStep2ProfilePatch = (
  current: CommerceConfig,
  baseline: CommerceConfig,
): VendorUpdateStorePayload => {
  const currentData = mapCommerceTypeToStep2Data(current);
  const baselineData = mapCommerceTypeToStep2Data(baseline);
  const patch: VendorUpdateStorePayload = {};

  if (currentData.commerce_type !== baselineData.commerce_type) {
    patch.commerce_type = currentData.commerce_type;
  }
  if (
    !areEqual(currentData.fulfillment_methods, baselineData.fulfillment_methods)
  ) {
    patch.fulfillment_methods = currentData.fulfillment_methods;
  }
  if (!areEqual(currentData.order_statuses, baselineData.order_statuses)) {
    patch.order_statuses = currentData.order_statuses;
  }

  return patch;
};

const getDeliveryAreasPayload = (commerce: CommerceConfig) => {
  if (!commerce.deliveryArea || !commerce.deliveryAreaName) {
    return [] as Array<{ area_sense_id: string; area_name: string }>;
  }

  return [
    {
      area_sense_id: commerce.deliveryArea,
      area_name: commerce.deliveryAreaName,
    },
  ];
};

const buildStep3ProfilePatch = (
  current: PaymentConfig,
  baseline: PaymentConfig,
): VendorUpdateStorePayload => {
  const currentPayment = mapFulfillmentDetailsToStep3Data([], current).payment;
  const baselinePayment = mapFulfillmentDetailsToStep3Data([], baseline).payment;

  if (areEqual(currentPayment, baselinePayment)) {
    return {};
  }

  return {
    payment_config: currentPayment as unknown as Record<string, unknown>,
  };
};

const buildStep4ProfilePatch = (
  current: StorefrontConfig,
  baseline: StorefrontConfig,
): VendorUpdateStorePayload => {
  const currentData = mapStorefrontToStep4Data(current);
  const baselineData = mapStorefrontToStep4Data(baseline);

  if (currentData.storefront_template === baselineData.storefront_template) {
    return {};
  }

  return {
    storefront_template: currentData.storefront_template,
  };
};

const cloneBaseline = (baseline: ActiveStoreBaseline): ActiveStoreBaseline =>
  createActiveStoreBaseline({
    currentStep: 0,
    draftId: null,
    storeId: null,
    initialLocationIds: [],
    businessDetails: baseline.businessDetails,
    commerce: baseline.commerce,
    payment: baseline.payment,
    storefront: baseline.storefront,
    fulfillmentCentres: [],
    isComplete: false,
  });

/**
 * Saves only changed fields for an active store step via
 * POST /vendor/store-onboarding/:storeId (+ side endpoints when needed).
 * Returns an updated baseline snapshot for the saved step fields.
 */
export const saveActiveStoreStepSparse = async (
  storeId: string,
  step: 1 | 2 | 3 | 4,
  current: StoreSetupState,
  baseline: ActiveStoreBaseline,
): Promise<ActiveStoreBaseline> => {
  const nextBaseline = cloneBaseline(baseline);

  if (step === 1) {
    const patch = buildStep1ProfilePatch(
      current.businessDetails,
      baseline.businessDetails,
    );

    if (Object.keys(patch).length > 0) {
      await updateStoreProfile(storeId, patch);
    }

    nextBaseline.businessDetails = { ...current.businessDetails };
    return nextBaseline;
  }

  if (step === 2) {
    const patch = buildStep2ProfilePatch(current.commerce, baseline.commerce);
    const currentAreas = getDeliveryAreasPayload(current.commerce);
    const baselineAreas = getDeliveryAreasPayload(baseline.commerce);

    if (Object.keys(patch).length > 0) {
      await updateStoreProfile(storeId, patch);
    }

    if (!areEqual(currentAreas, baselineAreas)) {
      await saveDeliveryAreas(storeId, currentAreas);
    }

    nextBaseline.commerce = {
      ...current.commerce,
      localFulfillment: [...current.commerce.localFulfillment],
      ecomFulfillment: [...current.commerce.ecomFulfillment],
      orderStatuses: current.commerce.orderStatuses.map((status) => ({
        ...status,
      })),
    };
    return nextBaseline;
  }

  if (step === 3) {
    const patch = buildStep3ProfilePatch(current.payment, baseline.payment);

    if (Object.keys(patch).length > 0) {
      await updateStoreProfile(storeId, patch);
    }

    nextBaseline.payment = {
      ...current.payment,
      methods: [...current.payment.methods],
    };
    return nextBaseline;
  }

  const profilePatch = buildStep4ProfilePatch(
    current.storefront,
    baseline.storefront,
  );
  const currentHandle = mapStorefrontToStep4Data(current.storefront).handle;
  const baselineHandle = mapStorefrontToStep4Data(baseline.storefront).handle;

  if (Object.keys(profilePatch).length > 0) {
    await updateStoreProfile(storeId, profilePatch);
  }

  if (currentHandle !== baselineHandle) {
    await updateSellerHandle(storeId, currentHandle);
  }

  nextBaseline.storefront = { ...current.storefront };
  return nextBaseline;
};
