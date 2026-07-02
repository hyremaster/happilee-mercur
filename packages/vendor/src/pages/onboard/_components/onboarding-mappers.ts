import { countries, getCountryByIso2 } from "../../../lib/data/countries";
import type { StoreOnboardingDraft } from "../../../services/onboardingServices";
import { DEFAULT_ORDER_STATUSES } from "./constants";
import type {
  BusinessDetails,
  CommerceConfig,
  FulfillmentCentre,
  PaymentConfig,
  StorefrontConfig,
  StoreSetupState,
  WizardStep,
} from "./types";

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const resolveCountryDisplay = (code: string | null | undefined): string => {
  if (!code) {
    return "";
  }

  return getCountryByIso2(code)?.display_name ?? code;
};

const fromApiCommerceType = (
  commerceType: string | undefined,
): StoreSetupState["commerce"]["commerceType"] => {
  switch (commerceType) {
    case "local_delivery":
      return "local-delivery";
    case "ecommerce_shipping":
      return "ecommerce-shipping";
    default:
      return "";
  }
};

const fromApiStorefrontTemplate = (template: string | undefined): string => {
  switch (template) {
    case "modern_minimal":
      return "minimal";
    case "bold_showcase":
      return "bold";
    default:
      return template ?? "classic";
  }
};

const draftStepToWizardStep = (onboardingStep: number): WizardStep => {
  const step = Math.min(Math.max(onboardingStep, 0), 3);
  return step as WizardStep;
};

const mapOrderStatuses = (
  orderStatuses: unknown,
): StoreSetupState["commerce"]["orderStatuses"] => {
  if (!Array.isArray(orderStatuses) || orderStatuses.length === 0) {
    return DEFAULT_ORDER_STATUSES.map((status) => ({ ...status }));
  }

  return orderStatuses.map((entry, index) => {
    const row = asObject(entry);

    return {
      id: asString(row.status) ?? `status-${index}`,
      label: asString(row.status) ?? "Status",
      required: asBoolean(row.is_required) ?? false,
      color: asString(row.color) ?? "var(--colors-brand-600)",
      displayName: asString(row.display_name) ?? asString(row.status) ?? "Status",
      active: asBoolean(row.is_active) ?? true,
    };
  });
};

const mapLocationToCentre = (
  location: Record<string, unknown>,
  index: number,
): StoreSetupState["fulfillmentCentres"][number] => {
  const address = asObject(location.address);

  return {
    id: `loc_${index}_${asString(location.name) ?? "centre"}`,
    name: asString(location.name) ?? "",
    address: asString(address.address_1) ?? "",
    city: asString(address.city) ?? "",
    state: asString(address.province) ?? "",
    country: resolveCountryDisplay(asString(address.country_code)),
    pinCode: asString(address.postal_code) ?? "",
    active: asBoolean(location.is_active) ?? true,
    lat: asNumber(location.latitude),
    lng: asNumber(location.longitude),
  };
};

export const mapDraftToStoreSetupState = (
  draft: StoreOnboardingDraft,
): StoreSetupState => {
  const data = draft.draft_data ?? {};
  const business = asObject(data.business);
  const commerce = asObject(data.commerce);
  const fulfillment = asObject(data.fulfillment);
  const storefront = asObject(data.storefront);
  const address = asObject(business.address);
  const professionalDetails = asObject(business.professional_details);
  const payment = asObject(fulfillment.payment);
  const locations = Array.isArray(fulfillment.locations)
    ? fulfillment.locations.map((location, index) =>
        mapLocationToCentre(asObject(location), index),
      )
    : [];

  const commerceType = fromApiCommerceType(asString(commerce.commerce_type));
  const fulfillmentMethods = Array.isArray(commerce.fulfillment_methods)
    ? commerce.fulfillment_methods.filter(
        (method): method is string => typeof method === "string",
      )
    : [];

  const paymentMethods: string[] = [];

  if (asBoolean(payment.online_enabled)) {
    paymentMethods.push("online");
  }

  if (asBoolean(payment.cod_enabled)) {
    paymentMethods.push("cod");
  }

  const codMin = payment.cod_min_amount;
  const codMax = payment.cod_max_amount;

  return {
    currentStep: draftStepToWizardStep(draft.onboarding_step),
    draftId: draft.id,
    businessDetails: {
      industry: asString(business.industry) ?? "restaurant",
      storeName: asString(business.name) ?? "",
      businessLegalName: asString(professionalDetails.corporate_name) ?? "",
      email: asString(business.email) ?? "",
      phone: asString(business.phone) ?? asString(address.phone) ?? "",
      address: asString(address.address_1) ?? "",
      country: resolveCountryDisplay(asString(address.country_code)),
      state: asString(address.province) ?? "",
      city: asString(address.city) ?? "",
      pinCode: asString(address.postal_code) ?? "",
      taxNumber: asString(professionalDetails.tax_id) ?? "",
    },
    commerce: {
      commerceType,
      localFulfillment:
        commerceType === "local-delivery" ? fulfillmentMethods : [],
      ecomFulfillment:
        commerceType === "ecommerce-shipping" ? fulfillmentMethods : [],
      deliveryArea: asString(commerce.delivery_area) ?? "",
      orderStatuses: mapOrderStatuses(data.order_statuses),
    },
    fulfillmentCentres: locations,
    payment: {
      methods: paymentMethods,
      paymentGateway: asString(payment.payment_provider_id) ?? "",
      codMin:
        typeof codMin === "number" && !Number.isNaN(codMin) ? String(codMin) : "",
      codMax:
        typeof codMax === "number" && !Number.isNaN(codMax) ? String(codMax) : "",
    },
    storefront: {
      handle: asString(storefront.handle) ?? "",
      template: fromApiStorefrontTemplate(asString(storefront.storefront_template)),
    },
    isComplete: false,
  };
};

export type BusinessDetailsDraftData = {
  name: string;
  email: string;
  owner_handle?: string;
  industry: string;
  phone?: string | null;
  address?: {
    address_1?: string | null;
    city?: string | null;
    country_code?: string | null;
    province?: string | null;
    postal_code?: string | null;
    phone?: string | null;
  };
  professional_details?: {
    corporate_name?: string | null;
    tax_id?: string | null;
  };
};

export type CommerceTypeDraftData = {
  commerce_type: string;
  fulfillment_methods: string[];
};

export type FulfillmentDetailsDraftData = {
  payment: {
    online_enabled: boolean;
    payment_provider_id?: string | null;
    cod_enabled: boolean;
    cod_min_amount?: number | null;
    cod_max_amount?: number | null;
    currency_code: string;
  };
  locations: Array<{
    name: string;
    address: {
      address_1?: string | null;
      city?: string | null;
      country_code?: string | null;
      province?: string | null;
      postal_code?: string | null;
    };
    is_active: boolean;
    latitude?: number | null;
    longitude?: number | null;
  }>;
};

export type StorefrontDraftData = {
  handle: string;
  storefront_template: string;
};

const toApiCommerceType = (commerceType: CommerceConfig["commerceType"]) => {
  switch (commerceType) {
    case "local-delivery":
      return "local_delivery";
    case "ecommerce-shipping":
      return "ecommerce_shipping";
    default:
      return "";
  }
};

const toApiStorefrontTemplate = (template: string) => {
  switch (template) {
    case "minimal":
      return "modern_minimal";
    case "bold":
      return "bold_showcase";
    default:
      return template;
  }
};

const resolveCountryCode = (country: string): string | null => {
  const trimmed = country.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length === 2) {
    return trimmed.toLowerCase();
  }

  const byIso2 = getCountryByIso2(trimmed);

  if (byIso2) {
    return byIso2.iso_2;
  }

  const normalized = trimmed.toLowerCase();
  const byName = countries.find(
    (entry) =>
      entry.display_name.toLowerCase() === normalized ||
      entry.name.toLowerCase() === normalized,
  );

  return byName?.iso_2 ?? null;
};

const parseAmount = (value: string): number | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const amount = Number.parseFloat(trimmed);

  return Number.isNaN(amount) ? null : amount;
};

const deriveOwnerHandle = (email: string): string | undefined => {
  const localPart = email.trim().split("@")[0]?.trim();

  if (!localPart) {
    return undefined;
  }

  const handle = localPart.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();

  return handle || undefined;
};

export const isBusinessDetailsValid = (data: BusinessDetails): boolean => {
  return (
    !!data.industry.trim() &&
    !!data.storeName.trim() &&
    !!data.businessLegalName.trim() &&
    !!data.email.trim() &&
    !!data.phone.trim() &&
    !!data.address.trim() &&
    !!data.country.trim() &&
    !!data.state.trim() &&
    !!data.city.trim() &&
    !!data.pinCode.trim()
  );
};

export const mapBusinessDetailsToStep1Data = (
  data: BusinessDetails,
): BusinessDetailsDraftData => {
  const payload: BusinessDetailsDraftData = {
    name: data.storeName.trim(),
    email: data.email.trim(),
    industry: data.industry,
    phone: data.phone.trim() || null,
    address: {
      address_1: data.address.trim() || null,
      city: data.city.trim() || null,
      country_code: resolveCountryCode(data.country),
      province: data.state.trim() || null,
      postal_code: data.pinCode.trim() || null,
      phone: data.phone.trim() || null,
    },
  };

  const ownerHandle = deriveOwnerHandle(data.email);

  if (ownerHandle) {
    payload.owner_handle = ownerHandle;
  }

  const corporateName = data.businessLegalName.trim();
  const taxId = data.taxNumber.trim();

  if (corporateName || taxId) {
    payload.professional_details = {
      corporate_name: corporateName || null,
      tax_id: taxId || null,
    };
  }

  return payload;
};

export const mapCommerceTypeToStep2Data = (
  data: CommerceConfig,
): CommerceTypeDraftData => {
  const fulfillmentMethods =
    data.commerceType === "local-delivery"
      ? data.localFulfillment
      : data.ecomFulfillment;

  return {
    commerce_type: toApiCommerceType(data.commerceType),
    fulfillment_methods: fulfillmentMethods,
  };
};

export const mapFulfillmentDetailsToStep3Data = (
  centres: FulfillmentCentre[],
  payment: PaymentConfig,
): FulfillmentDetailsDraftData => {
  const onlineEnabled = payment.methods.includes("online");
  const codEnabled = payment.methods.includes("cod");

  return {
    payment: {
      online_enabled: onlineEnabled,
      payment_provider_id: onlineEnabled ? payment.paymentGateway || null : null,
      cod_enabled: codEnabled,
      cod_min_amount: codEnabled ? parseAmount(payment.codMin) : null,
      cod_max_amount: codEnabled ? parseAmount(payment.codMax) : null,
      currency_code: "inr",
    },
    locations: centres.map((centre) => ({
      name: centre.name.trim(),
      address: {
        address_1: centre.address.trim() || null,
        city: centre.city.trim() || null,
        country_code: resolveCountryCode(centre.country),
        province: centre.state.trim() || null,
        postal_code: centre.pinCode.trim() || null,
      },
      is_active: centre.active,
      latitude: centre.lat ?? null,
      longitude: centre.lng ?? null,
    })),
  };
};

export const mapStorefrontToStep4Data = (
  data: StorefrontConfig,
): StorefrontDraftData => {
  return {
    handle: data.handle.trim(),
    storefront_template: toApiStorefrontTemplate(data.template),
  };
};
