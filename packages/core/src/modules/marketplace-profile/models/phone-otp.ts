import { model } from "@medusajs/framework/utils"

/**
 * A pending phone-number one-time password for WhatsApp-OTP customer auth.
 *
 * The plaintext code is never stored — only a salted SHA-256 hash
 * (`code_hash`). A row is "live" while `consumed_at IS NULL` and
 * `expires_at > now()`. On a successful verify the row is marked consumed;
 * `attempts` caps brute-forcing. `send-otp` throttles by looking at the most
 * recent live row's `created_at`.
 */
const PhoneOtp = model
  .define("PhoneOtp", {
    id: model.id({ prefix: "potp" }).primaryKey(),
    phone: model.text(),
    code_hash: model.text(),
    expires_at: model.dateTime(),
    attempts: model.number().default(0),
    consumed_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_phone_otp_phone",
      on: ["phone"],
      where: "deleted_at IS NULL",
    },
  ])

export default PhoneOtp
