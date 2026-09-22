import { z } from "zod";

export const EMAIL_INVALID_MESSAGE = "Please enter a valid email address.";

const emailSchema = z.string().trim().email();

export function isValidEmailFormat(value: string): boolean {
  return emailSchema.safeParse(value).success;
}
