import { describe, expect, test } from "bun:test";

import {
  AREA_SENSE_APP_URLS,
  detectAppEnvironment,
  getAreaSenseAppUrl,
  getSessionExpiredRedirectUrl,
  isLocalVendorHost,
  MY_APPS_URLS,
} from "../environment";

describe("detectAppEnvironment", () => {
  test("maps localhost and ramish.dev to development", () => {
    expect(detectAppEnvironment("localhost")).toBe("development");
    expect(detectAppEnvironment("127.0.0.1")).toBe("development");
    expect(detectAppEnvironment("vendor-ecom.ramish.dev")).toBe("development");
  });

  test("maps stage vendor host to staging", () => {
    expect(detectAppEnvironment("stage-vendor-ecom.happilee.io")).toBe(
      "staging",
    );
  });

  test("defaults unknown hosts to production", () => {
    expect(detectAppEnvironment("vendor.example.com")).toBe("production");
  });
});

describe("isLocalVendorHost", () => {
  test("treats localhost and loopback as local", () => {
    expect(isLocalVendorHost("localhost")).toBe(true);
    expect(isLocalVendorHost("127.0.0.1")).toBe(true);
  });

  test("treats deployed vendor hosts as non-local", () => {
    expect(isLocalVendorHost("dev-vendor-ecom.happilee.io")).toBe(false);
    expect(isLocalVendorHost("stage-vendor-ecom.happilee.io")).toBe(false);
  });
});

describe("getSessionExpiredRedirectUrl", () => {
  test("keeps localhost on the vendor login page", () => {
    expect(getSessionExpiredRedirectUrl({ hostname: "localhost" })).toBe(
      "/login?reason=Unauthorized",
    );
    expect(getSessionExpiredRedirectUrl({ hostname: "127.0.0.1" })).toBe(
      "/login?reason=Unauthorized",
    );
  });

  test("sends deployed dev vendor to Happilee dev My Apps", () => {
    expect(
      getSessionExpiredRedirectUrl({ hostname: "dev-vendor-ecom.happilee.io" }),
    ).toBe(MY_APPS_URLS.development);
  });

  test("sends stage vendor to Happilee stage My Apps", () => {
    expect(
      getSessionExpiredRedirectUrl({
        hostname: "stage-vendor-ecom.happilee.io",
      }),
    ).toBe(MY_APPS_URLS.staging);
  });
});

describe("getAreaSenseAppUrl", () => {
  test("redirects local and ramish.dev to Happilee dev Area Sense", () => {
    expect(getAreaSenseAppUrl({ hostname: "localhost", areaSenseAppUrl: null })).toBe(
      AREA_SENSE_APP_URLS.development,
    );
    expect(
      getAreaSenseAppUrl({
        hostname: "vendor-ecom.ramish.dev",
        areaSenseAppUrl: null,
      }),
    ).toBe("https://dev-app.happilee.io/my-apps/area-sense");
  });

  test("redirects stage vendor to Happilee stage Area Sense", () => {
    expect(
      getAreaSenseAppUrl({
        hostname: "stage-vendor-ecom.happilee.io",
        areaSenseAppUrl: null,
      }),
    ).toBe("https://stage-app.happilee.io/my-apps/area-sense");
  });

  test("prefers explicit env override over hostname mapping", () => {
    expect(
      getAreaSenseAppUrl({
        hostname: "stage-vendor-ecom.happilee.io",
        areaSenseAppUrl: "https://custom.example/area-sense",
      }),
    ).toBe("https://custom.example/area-sense");
  });
});
