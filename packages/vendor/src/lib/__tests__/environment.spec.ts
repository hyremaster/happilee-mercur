import { describe, expect, test } from "bun:test";

import {
  AREA_SENSE_APP_URLS,
  detectAppEnvironment,
  getAreaSenseAppUrl,
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
