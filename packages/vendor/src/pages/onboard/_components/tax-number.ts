import { resolveCountryIso2 } from "./address-select-fields";

/**
 * Tax / GST registration numbers vary by country, but only letters, digits,
 * spaces, hyphens, dots, and slashes are allowed.
 */
const TAX_NUMBER_PATTERN = /^[A-Za-z0-9\s\-\/.]+$/;

/** India's GSTIN is always exactly 15 alphanumeric characters. */
const GSTIN_PATTERN = /^[A-Za-z0-9]{15}$/;

export const TAX_NUMBER_INVALID_MESSAGE =
  "Tax/GST number can only include letters, numbers, spaces, hyphens, dots, and slashes.";

export const GSTIN_INVALID_MESSAGE =
  "GST number must be exactly 15 alphanumeric characters.";

export function isValidTaxNumberFormat(
  value: string,
  country?: string,
): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (resolveCountryIso2(country ?? "") === "in") {
    return GSTIN_PATTERN.test(trimmed);
  }

  return TAX_NUMBER_PATTERN.test(trimmed);
}
