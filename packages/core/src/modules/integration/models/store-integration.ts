import { model } from "@medusajs/framework/utils"
import { StoreIntegrationStatus } from "@mercurjs/types"

/**
 * A store's connection to one integration provider (one row per seller per
 * provider). Provider-agnostic: provider-specific data lives in `credentials`
 * (encrypted JSON, `enc:v1:…`) and `settings` (plain JSON), shaped by the
 * provider's field descriptors.
 *
 * `seller_id` is a plain text cross-module reference (no defineLink), joined in
 * the application layer, matching the marketplace_profile convention.
 * `provider_id` is the provider id configured in medusa-config.
 */
const StoreIntegration = model
  .define("StoreIntegration", {
    id: model.id({ prefix: "sinteg" }).primaryKey(),
    seller_id: model.text(),
    provider_id: model.text(),
    label: model.text().nullable(),
    is_enabled: model.boolean().default(true),
    credentials: model.text().nullable(),
    settings: model.json().nullable(),
    status: model
      .enum(StoreIntegrationStatus)
      .default(StoreIntegrationStatus.UNTESTED),
    last_checked_at: model.dateTime().nullable(),
    last_error: model.text().nullable(),
    updated_by: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_store_integration_seller_provider_unique",
      on: ["seller_id", "provider_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_store_integration_seller_id",
      on: ["seller_id"],
      where: "deleted_at IS NULL",
    },
  ])

export default StoreIntegration
