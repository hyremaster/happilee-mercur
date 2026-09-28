import { describe, expect, test } from "bun:test";

import { isValidTaxNumberFormat } from "../tax-number";

describe("isValidTaxNumberFormat", () => {
  test("accepts letters, numbers, spaces, hyphens, dots, and slashes when no country is given", () => {
    expect(isValidTaxNumberFormat("29AAAAA0000A1Z5")).toBe(true);
    expect(isValidTaxNumberFormat("ABC123")).toBe(true);
    expect(isValidTaxNumberFormat("12-3456789")).toBe(true);
    expect(isValidTaxNumberFormat("GB 123 456 789")).toBe(true);
    expect(isValidTaxNumberFormat("EU/123456")).toBe(true);
    expect(isValidTaxNumberFormat("12.345.678")).toBe(true);
  });

  test("accepts international tax numbers for non-Indian countries", () => {
    expect(isValidTaxNumberFormat("GB 123 456 789", "United Kingdom")).toBe(
      true,
    );
    expect(isValidTaxNumberFormat("EU/123456", "United States")).toBe(true);
  });

  test("rejects unsupported special characters", () => {
    expect(isValidTaxNumberFormat("GST@1234")).toBe(false);
    expect(isValidTaxNumberFormat("ABC#123")).toBe(false);
    expect(isValidTaxNumberFormat("TAX$id")).toBe(false);
    expect(isValidTaxNumberFormat("ID!")).toBe(false);
    expect(isValidTaxNumberFormat("TAX_ID")).toBe(false);
    expect(isValidTaxNumberFormat("ID+1")).toBe(false);
  });

  test("rejects empty or whitespace-only values", () => {
    expect(isValidTaxNumberFormat("")).toBe(false);
    expect(isValidTaxNumberFormat("   ")).toBe(false);
  });

  test("requires exactly 15 alphanumeric characters for India (GSTIN)", () => {
    expect(isValidTaxNumberFormat("29AAAAA0000A1Z5", "India")).toBe(true);
    expect(isValidTaxNumberFormat("29AAAAA0000A1Z5", "IN")).toBe(true);
  });

  test("rejects GST numbers that aren't 15 alphanumeric characters", () => {
    expect(isValidTaxNumberFormat("29AAAAA0000A1Z", "India")).toBe(false);
    expect(isValidTaxNumberFormat("29AAAAA0000A1Z55", "India")).toBe(false);
    expect(isValidTaxNumberFormat("29 AAAAA 0000 A1Z5", "India")).toBe(false);
    expect(isValidTaxNumberFormat("29-AAAAA0000A1Z5", "India")).toBe(false);
    expect(isValidTaxNumberFormat("GST@1234000A1Z5", "India")).toBe(false);
  });
});
