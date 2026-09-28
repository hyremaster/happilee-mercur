/** Prefer a non-empty Error.message from the API client; otherwise use fallback. */
export function getApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) {
      return message;
    }
  }

  return fallback;
}
