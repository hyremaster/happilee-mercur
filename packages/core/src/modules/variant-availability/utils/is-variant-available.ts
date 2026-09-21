export type VariantAvailabilityState = {
  is_available?: boolean | null
  unavailable_until?: Date | string | null
}

/**
 * A variant is available unless it is explicitly marked unavailable and that
 * mark has not expired. No record (`null`/`undefined`) means available, as does
 * an `unavailable_until` in the past.
 */
export function isVariantAvailable(
  state: VariantAvailabilityState | null | undefined,
  now: Date = new Date()
): boolean {
  if (!state || state.is_available !== false) {
    return true
  }

  if (!state.unavailable_until) {
    return false
  }

  return new Date(state.unavailable_until).getTime() <= now.getTime()
}
