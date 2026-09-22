import { describe, expect, test } from "bun:test";

import {
  isValidStoreNameFormat,
  STORE_NAME_MAX_LENGTH,
  STORE_NAME_MIN_LENGTH,
} from "../store-name";

describe("isValidStoreNameFormat", () => {
  test("accepts names within the allowed length range", () => {
    expect(isValidStoreNameFormat("AB")).toBe(true);
    expect(isValidStoreNameFormat("Century sports")).toBe(true);
    expect(isValidStoreNameFormat("A".repeat(STORE_NAME_MAX_LENGTH))).toBe(
      true,
    );
  });

  test("rejects names that are too short or too long", () => {
    expect(isValidStoreNameFormat("A")).toBe(false);
    expect(
      isValidStoreNameFormat("A".repeat(STORE_NAME_MAX_LENGTH + 1)),
    ).toBe(false);
  });

  test("rejects empty or whitespace-only values", () => {
    expect(isValidStoreNameFormat("")).toBe(false);
    expect(isValidStoreNameFormat("   ")).toBe(false);
    expect(isValidStoreNameFormat(" A ")).toBe(false);
    expect(
      isValidStoreNameFormat(` ${"A".repeat(STORE_NAME_MIN_LENGTH)} `),
    ).toBe(true);
  });
});
