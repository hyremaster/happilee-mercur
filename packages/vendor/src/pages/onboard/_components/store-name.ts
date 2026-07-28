export const STORE_NAME_MIN_LENGTH = 2;
export const STORE_NAME_MAX_LENGTH = 100;

export const STORE_NAME_INVALID_MESSAGE =
  "Store name must be between 2 and 100 characters.";

export function isValidStoreNameFormat(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length >= STORE_NAME_MIN_LENGTH &&
    trimmed.length <= STORE_NAME_MAX_LENGTH
  );
}
