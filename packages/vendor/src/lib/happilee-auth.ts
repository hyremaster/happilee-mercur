/** Public route shown when the Mercur vendor session is no longer valid. */
export const SESSION_EXPIRED_PATH = "/session-expired"

export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  )
}

/**
 * Happilee "My Apps" entry point for re-authentication via SSO.
 * - Local vendor (`localhost` / `127.0.0.1`): https://dev-app.happilee.io/my-apps
 * - Deployed environments: https://app.happilee.io/my-apps
 *
 * Optional override: set `VITE_HAPPILEE_APP_URL` to a Happilee app base
 * (e.g. `https://dev-app.happilee.io`) when a non-local deploy should use
 * the Happilee development environment.
 */
export function getHappileeMyAppsUrl(
  hostname: string = typeof window !== "undefined"
    ? window.location.hostname
    : "",
): string {
  const viteEnv = (
    import.meta as ImportMeta & {
      env?: Record<string, string | boolean | undefined>
    }
  ).env
  const configured = viteEnv?.VITE_HAPPILEE_APP_URL

  if (typeof configured === "string" && configured.length > 0) {
    return `${configured.replace(/\/$/, "")}/my-apps`
  }

  if (isLocalHostname(hostname)) {
    return "https://dev-app.happilee.io/my-apps"
  }

  return "https://app.happilee.io/my-apps"
}

/** Hard navigation to the session-expired page (avoids loops if already there). */
export function redirectToSessionExpired(): void {
  if (window.location.pathname === SESSION_EXPIRED_PATH) {
    return
  }

  window.location.href = SESSION_EXPIRED_PATH
}
