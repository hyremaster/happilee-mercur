import { z } from "zod"

// E.164-ish: leading "+" optional, 8-15 digits. Kept permissive; WhatsApp
// itself is the source of truth for deliverability.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, "phone must be a valid international number")

export type StoreSendPhoneOtpType = z.infer<typeof StoreSendPhoneOtp>
export const StoreSendPhoneOtp = z.object({
  phone: phoneSchema,
})

export type StoreVerifyPhoneOtpType = z.infer<typeof StoreVerifyPhoneOtp>
export const StoreVerifyPhoneOtp = z.object({
  phone: phoneSchema,
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "otp must be a numeric code"),
  first_name: z.string().trim().min(1).optional(),
  last_name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
})
