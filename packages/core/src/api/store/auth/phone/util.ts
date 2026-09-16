/**
 * Canonical phone key used across OTP storage and the auth identity's
 * `entity_id`, so the same number always maps to the same record regardless of
 * how the client formatted it. Keeps digits, guarantees a single leading "+".
 */
export const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/[^\d]/g, "")
  return `+${digits}`
}
