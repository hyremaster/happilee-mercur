import { describe, expect, test } from "bun:test";

import { isValidPinCodeFormat } from "../pin-code";

describe("isValidPinCodeFormat", () => {
  test("rejects single-digit and empty values", () => {
    expect(isValidPinCodeFormat("1", "India")).toBe(false);
    expect(isValidPinCodeFormat("1", "IN")).toBe(false);
    expect(isValidPinCodeFormat("", "India")).toBe(false);
    expect(isValidPinCodeFormat("   ", "India")).toBe(false);
  });

  test("validates India PIN codes as 6 digits", () => {
    expect(isValidPinCodeFormat("560066", "India")).toBe(true);
    expect(isValidPinCodeFormat("110001", "in")).toBe(true);
    expect(isValidPinCodeFormat("12345", "India")).toBe(false);
    expect(isValidPinCodeFormat("1234567", "India")).toBe(false);
    expect(isValidPinCodeFormat("ABC123", "India")).toBe(false);
  });

  test("validates US ZIP codes", () => {
    expect(isValidPinCodeFormat("90210", "United States")).toBe(true);
    expect(isValidPinCodeFormat("90210-1234", "US")).toBe(true);
    expect(isValidPinCodeFormat("1", "US")).toBe(false);
    expect(isValidPinCodeFormat("9021", "US")).toBe(false);
  });

  test("uses a multi-character fallback for unknown countries", () => {
    expect(isValidPinCodeFormat("12", "Unknownland")).toBe(true);
    expect(isValidPinCodeFormat("1", "Unknownland")).toBe(false);
  });
});
