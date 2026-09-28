/**
 * Environment-aware configuration for the vendor panel.
 *
 * Combines:
 * - runtime environment detection (hostname of the current vendor host)
 * - optional Vite env override (`VITE_AREA_SENSE_APP_URL`)
 */

export type AppEnvironment = "development" | "staging" | "production";

const AREA_SENSE_APP_PATH = "/my-apps/area-sense";
const MY_APPS_PATH = "/my-apps";
const LOCAL_SESSION_EXPIRED_PATH = "/login?reason=Unauthorized";

export const AREA_SENSE_APP_URLS: Record<AppEnvironment, string> = {
  development: `https://dev-app.happilee.io${AREA_SENSE_APP_PATH}`,
  staging: `https://stage-app.happilee.io${AREA_SENSE_APP_PATH}`,
  production: `https://app.happilee.io${AREA_SENSE_APP_PATH}`,
};

/** Happilee My Apps hub for each deployment (session-expired redirect target). */
export const MY_APPS_URLS: Record<AppEnvironment, string> = {
  development: `https://dev-app.happilee.io${MY_APPS_PATH}`,
  staging: `https://stage-app.happilee.io${MY_APPS_PATH}`,
  production: `https://app.happilee.io${MY_APPS_PATH}`,
};

/**
 * Vendor panel hosts → deployment environment.
 * localhost / the dev vendor host share the Happilee dev app; stage vendor maps
 * to the stage app.
 */
const HOST_ENVIRONMENT_MAP: Record<string, AppEnvironment> = {
  localhost: "development",
  "127.0.0.1": "development",
  "vendor-ecom.ramish.dev": "development",
  "dev-vendor-ecom.happilee.io": "development",
  "stage-vendor-ecom.happilee.io": "staging",
};

const LOCAL_VENDOR_HOSTS = new Set(["localhost", "127.0.0.1"]);

export type EnvironmentConfigOptions = {
  hostname?: string;
  /** Explicit override; when omitted, reads `import.meta.env.VITE_AREA_SENSE_APP_URL`. */
  areaSenseAppUrl?: string | null;
};

function readViteAreaSenseAppUrl(): string | undefined {
  try {
    const value = import.meta.env?.VITE_AREA_SENSE_APP_URL;
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  } catch {
    // import.meta.env may be unavailable outside Vite (e.g. unit tests).
  }
  return undefined;
}

function resolveHostname(hostname?: string): string {
  if (hostname !== undefined) {
    return hostname;
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    return window.location.hostname;
  }
  return "localhost";
}

export function detectAppEnvironment(
  hostname?: string,
): AppEnvironment {
  const normalized = resolveHostname(hostname).toLowerCase();
  return HOST_ENVIRONMENT_MAP[normalized] ?? "production";
}

/** True when the vendor panel is running on a local machine (not a deployed host). */
export function isLocalVendorHost(hostname?: string): boolean {
  return LOCAL_VENDOR_HOSTS.has(resolveHostname(hostname).toLowerCase());
}

/**
 * Where to send the user when the vendor session expires.
 * - localhost / 127.0.0.1 → local vendor login
 * - deployed hosts → matching Happilee My Apps hub
 */
export function getSessionExpiredRedirectUrl(
  options: Pick<EnvironmentConfigOptions, "hostname"> = {},
): string {
  if (isLocalVendorHost(options.hostname)) {
    return LOCAL_SESSION_EXPIRED_PATH;
  }
  return MY_APPS_URLS[detectAppEnvironment(options.hostname)];
}

/** Full-page redirect used by fetch/error handlers on 401. */
export function redirectOnSessionExpired(
  options: Pick<EnvironmentConfigOptions, "hostname"> = {},
): void {
  window.location.href = getSessionExpiredRedirectUrl(options);
}

/**
 * Area Sense deep-link for the current deployment.
 * Precedence: explicit/Vite override → hostname map → production default.
 */
export function getAreaSenseAppUrl(
  options: EnvironmentConfigOptions = {},
): string {
  const override =
    options.areaSenseAppUrl !== undefined
      ? options.areaSenseAppUrl
      : readViteAreaSenseAppUrl();

  if (typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }

  return AREA_SENSE_APP_URLS[detectAppEnvironment(options.hostname)];
}
