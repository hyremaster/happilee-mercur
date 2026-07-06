import { HANDLE_REGEX } from "./constants";

export function getHandleFormatStatus(handle: string) {
  if (!handle.trim()) return { valid: false, message: "" };
  if (!HANDLE_REGEX.test(handle)) {
    return {
      valid: false,
      message: "Only lowercase letters, numbers, and hyphens are allowed",
    };
  }
  return { valid: true, message: "" };
}
