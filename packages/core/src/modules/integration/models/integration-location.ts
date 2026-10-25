import { model } from "@medusajs/framework/utils"
import { IntegrationLocationStatus } from "@mercurjs/types"

/**
 * A location (outlet, warehouse, hub) reported by an integration provider, and
 * the branch (stock location) it maps to.
 *
 * Keyed by (seller_id, provider_id), not by the store_integration row: a
 * disconnect soft-deletes the connection and a reconnect creates a new row, so
 * mappings must survive that. `stock_location_id` is a plain text cross-module
 * reference (no FK), validated against the seller's stock locations in the API.
 */
const IntegrationLocation = model
  .define("IntegrationLocation", {
    id: model.id({ prefix: "intloc" }).primaryKey(),
    seller_id: model.text(),
    provider_id: model.text(),
    external_id: model.text(),
    name: model.text(),
    code: model.text().nullable(),
    address: model.text().nullable(),
    city: model.text().nullable(),
    status: model
      .enum(IntegrationLocationStatus)
      .default(IntegrationLocationStatus.ACTIVE),
    stock_location_id: model.text().nullable(),
    last_seen_at: model.dateTime().nullable(),
    raw: model.json().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_integration_location_external_unique",
      on: ["seller_id", "provider_id", "external_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      // One branch maps to at most one location per provider.
      name: "IDX_integration_location_stock_location_unique",
      on: ["seller_id", "provider_id", "stock_location_id"],
      unique: true,
      where: "deleted_at IS NULL AND stock_location_id IS NOT NULL",
    },
    {
      name: "IDX_integration_location_seller_provider",
      on: ["seller_id", "provider_id"],
      where: "deleted_at IS NULL",
    },
  ])

export default IntegrationLocation
