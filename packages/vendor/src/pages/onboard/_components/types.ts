export type WizardStep = 0 | 1 | 2 | 3 | 4;

export type BusinessDetails = {
  industry: string;
  storeName: string;
  businessLegalName: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  state: string;
  city: string;
  pinCode: string;
  taxNumber: string;
};

export type OrderStatusConfig = {
  id: string;
  label: string;
  required: boolean;
  color: string;
  displayName: string;
  active: boolean;
};

export type CommerceType = "local-delivery" | "ecommerce-shipping" | "";

export type CommerceConfig = {
  commerceType: CommerceType;
  localFulfillment: string[];
  ecomFulfillment: string[];
  deliveryArea: string;
  orderStatuses: OrderStatusConfig[];
};

export type FulfillmentCentre = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pinCode: string;
  active: boolean;
  lat?: number;
  lng?: number;
};

export type PaymentConfig = {
  methods: string[];
  paymentGateway: string;
  codMin: string;
  codMax: string;
};

export type StorefrontConfig = {
  handle: string;
  template: string;
};

export type StoreSetupState = {
  currentStep: WizardStep;
  businessDetails: BusinessDetails;
  commerce: CommerceConfig;
  fulfillmentCentres: FulfillmentCentre[];
  payment: PaymentConfig;
  storefront: StorefrontConfig;
  isComplete: boolean;
};
