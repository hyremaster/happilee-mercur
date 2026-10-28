import { model } from "@medusajs/framework/utils"

/**
 * Staged copy of an item (product master row) from an integration provider.
 * Written by the `items` sync stream with bulk SQL upserts (see
 * IntegrationModuleService.upsertExternalItemsPage); projected into Medusa
 * products later. `projection_pending` marks rows whose data changed since the
 * last projection. Provider status codes are stored as-is, not interpreted.
 */
const IntegrationExternalItem = model
  .define("IntegrationExternalItem", {
    id: model.id({ prefix: "intitem" }).primaryKey(),
    seller_id: model.text(),
    provider_id: model.text(),
    external_id: model.text(),
    name: model.text(),
    sku: model.text().nullable(),
    barcode: model.text().nullable(),
    status: model.text().nullable(),
    is_active: model.boolean().default(true),
    manufacturer: model.text().nullable(),
    tax_rate: model.float().nullable(),
    hsn_code: model.text().nullable(),
    attributes: model.json().nullable(),
    raw: model.json().nullable(),
    raw_hash: model.text(),
    projection_pending: model.boolean().default(true),
    last_seen_at: model.dateTime(),
  })
  .indexes([
    {
      name: "IDX_integration_external_item_unique",
      on: ["seller_id", "provider_id", "external_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_integration_external_item_sku",
      on: ["seller_id", "provider_id", "sku"],
      where: "deleted_at IS NULL AND sku IS NOT NULL",
    },
    {
      name: "IDX_integration_external_item_pending",
      on: ["seller_id", "provider_id"],
      where: "deleted_at IS NULL AND projection_pending = true",
    },
  ])

export default IntegrationExternalItem
