import { describe, expect, test } from "bun:test";

import { getApiErrorMessage } from "../api-error";

describe("getApiErrorMessage", () => {
  test("returns the API error message when present", () => {
    expect(
      getApiErrorMessage(
        new Error(
          "Invalid Razorpay API key or secret. Please check the credentials and try again.",
        ),
        "Failed to save fulfillment details. Please try again.",
      ),
    ).toBe(
      "Invalid Razorpay API key or secret. Please check the credentials and try again.",
    );
  });

  test("returns the fallback for non-Error values", () => {
    expect(
      getApiErrorMessage(
        "boom",
        "Failed to save fulfillment details. Please try again.",
      ),
    ).toBe("Failed to save fulfillment details. Please try again.");
  });

  test("returns the fallback for blank Error messages", () => {
    expect(
      getApiErrorMessage(
        new Error("   "),
        "Failed to save fulfillment details. Please try again.",
      ),
    ).toBe("Failed to save fulfillment details. Please try again.");
  });
});
