/** Default max length for short single-line text inputs (city, etc.). */
export const FIELD_LIMIT_DEFAULT = 50;

/** Max length for multi-line address fields. */
export const FIELD_LIMIT_ADDRESS = 200;

/** Store display name — often longer than a generic short field. */
export const FIELD_LIMIT_STORE_NAME = 100;

/** Registered legal entity names can exceed typical short-field limits. */
export const FIELD_LIMIT_BUSINESS_LEGAL_NAME = 150;

/** RFC 5321 practical upper bound for email addresses. */
export const FIELD_LIMIT_EMAIL = 254;

/** Tax / GST identifiers (e.g. 15-char GSTIN plus international formats). */
export const FIELD_LIMIT_TAX_NUMBER = 30;

/** Postal / PIN codes (country validators allow up to 15). */
export const FIELD_LIMIT_PIN_CODE = 15;

/** Fulfillment centre / location label. */
export const FIELD_LIMIT_LOCATION_NAME = 100;

/** Custom order-status label shown to customers. */
export const FIELD_LIMIT_ORDER_STATUS_DISPLAY_NAME = 100;

/** User-defined payment gateway label. */
export const FIELD_LIMIT_PAYMENT_METHOD_NAME = 100;

/** API key / secret values from payment providers. */
export const FIELD_LIMIT_PAYMENT_CREDENTIAL = 200;

/** Storefront URL slug (subdomain-style handle). */
export const FIELD_LIMIT_STORE_HANDLE = 63;

export function clampFieldLength(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}
