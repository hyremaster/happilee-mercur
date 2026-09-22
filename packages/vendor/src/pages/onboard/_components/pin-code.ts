import { resolveCountryIso2 } from "./address-select-fields";

/**
 * Country-specific postal / PIN formats (ISO2 → pattern).
 * Fallback rejects single-character values for unknown countries.
 */
const POSTAL_CODE_PATTERNS: Record<string, RegExp> = {
  in: /^\d{6}$/,
  us: /^\d{5}(?:-\d{4})?$/,
  ca: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  gb: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/,
  au: /^\d{4}$/,
  de: /^\d{5}$/,
  fr: /^\d{5}$/,
  nl: /^\d{4}\s?[A-Za-z]{2}$/,
  sg: /^\d{6}$/,
  ae: /^[A-Za-z0-9]{3,8}$/,
  pk: /^\d{5}$/,
  bd: /^\d{4}$/,
  lk: /^\d{5}$/,
  np: /^\d{5}$/,
  my: /^\d{5}$/,
  id: /^\d{5}$/,
  ph: /^\d{4}$/,
  jp: /^\d{3}-?\d{4}$/,
  cn: /^\d{6}$/,
  br: /^\d{5}-?\d{3}$/,
  mx: /^\d{5}$/,
  za: /^\d{4}$/,
  nz: /^\d{4}$/,
  ie: /^[A-Za-z0-9]{3}\s?[A-Za-z0-9]{4}$/,
  it: /^\d{5}$/,
  es: /^\d{5}$/,
  pt: /^\d{4}-?\d{3}$/,
  ch: /^\d{4}$/,
  se: /^\d{3}\s?\d{2}$/,
  no: /^\d{4}$/,
  dk: /^\d{4}$/,
  be: /^\d{4}$/,
  at: /^\d{4}$/,
  pl: /^\d{2}-?\d{3}$/,
};

/** Fallback: at least 2 chars; letters/digits with optional space or hyphen. */
const FALLBACK_POSTAL_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\s\-]{0,14}$/;

export const PIN_CODE_INVALID_MESSAGE = "Please enter a valid PIN code.";

export function isValidPinCodeFormat(
  pinCode: string,
  country: string,
): boolean {
  const trimmed = pinCode.trim();
  if (!trimmed) {
    return false;
  }

  // Single-character values are never a valid postal/PIN format.
  if (trimmed.length < 2) {
    return false;
  }

  const iso2 = resolveCountryIso2(country);
  const pattern = iso2 ? POSTAL_CODE_PATTERNS[iso2] : undefined;

  if (pattern) {
    return pattern.test(trimmed);
  }

  return (
    trimmed.length >= 2 &&
    FALLBACK_POSTAL_CODE_PATTERN.test(trimmed) &&
    trimmed.length <= 15
  );
}
