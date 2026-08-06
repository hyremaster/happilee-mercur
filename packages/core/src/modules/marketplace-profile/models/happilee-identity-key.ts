import { model } from "@medusajs/framework/utils"

/**
 * Per-identity binding of the Happilee (Area Sense) API key that authorized the
 * vendor's current login session.
 *
 * Written server-side at `/sso` for every SSO case, keyed by the verified
 * `auth_identity_id`. It lets a store the vendor creates *inside* the dashboard
 * (no SSO token for that store) inherit the key of the project whose SSO
 * authorized the session. Overwritten on each SSO, so the most recent login
 * wins (per-identity, last-SSO-wins semantics).
 *
 * Secret: this column is consumed server-side only and is NEVER serialized to
 * the SPA — no vendor route returns this entity, and store_profile responses
 * strip `happilee_api_key` via `sanitizeStoreProfile`.
 */
const HappileeIdentityKey = model
  .define("HappileeIdentityKey", {
    id: model.id({ prefix: "hidkey" }).primaryKey(),
    auth_identity_id: model.text(),
    project_id: model.text().nullable(),
    happilee_api_key: model.text(),
  })
  .indexes([
    {
      name: "IDX_happilee_identity_key_auth_identity_id",
      on: ["auth_identity_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default HappileeIdentityKey
