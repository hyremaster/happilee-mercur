import { describe, expect, test } from "bun:test";

import { isValidEmailFormat } from "../email";

describe("isValidEmailFormat", () => {
  test("accepts valid email addresses", () => {
    expect(isValidEmailFormat("user@example.com")).toBe(true);
    expect(isValidEmailFormat("a.b@gmail.com")).toBe(true);
    expect(isValidEmailFormat("user.name+tag@example.co.uk")).toBe(true);
    expect(isValidEmailFormat("  user@example.com  ")).toBe(true);
  });

  test("rejects incomplete or malformed addresses from bug report", () => {
    expect(isValidEmailFormat("abc")).toBe(false);
    expect(isValidEmailFormat("abc@")).toBe(false);
    expect(isValidEmailFormat("abc@gmail")).toBe(false);
    expect(isValidEmailFormat("abc..123@gmail.com")).toBe(false);
  });

  test("rejects empty or whitespace-only values", () => {
    expect(isValidEmailFormat("")).toBe(false);
    expect(isValidEmailFormat("   ")).toBe(false);
  });
});
