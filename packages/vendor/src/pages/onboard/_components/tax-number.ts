/**
 * Tax / GST registration numbers vary by country, but only letters, digits,
 * spaces, hyphens, dots, and slashes are allowed.
 */
const TAX_NUMBER_PATTERN = /^[A-Za-z0-9\s\-\/.]+$/;

export const TAX_NUMBER_INVALID_MESSAGE =
  "Tax/GST number can only include letters, numbers, spaces, hyphens, dots, and slashes.";

export function isValidTaxNumberFormat(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return TAX_NUMBER_PATTERN.test(trimmed);
}
