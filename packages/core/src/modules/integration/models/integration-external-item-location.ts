import { model } from "@medusajs/framework/utils"

/**
 * Item data per external location (outlet): online flag, buffer, prices.
 * Keyed by external ids (not FKs) so price rows can land before or after the
 * item row. The items stream owns sku/online/buffer/special price; the prices
 * stream owns MRP/sale/original price/tax. Each has its own hash and timestamp.
 */
const IntegrationExternalItemLocation = model
  .define("IntegrationExternalItemLocation", {
    id: model.id({ prefix: "intitloc" }).primaryKey(),
    seller_id: model.text(),
    provider_id: model.text(),
    item_external_id: model.text(),
    location_external_id: model.text(),
    sku: model.text().nullable(),
    is_online: model.boolean().nullable(),
    buffer_qty: model.float().nullable(),
    sale_price: model.bigNumber().nullable(),
    special_price: model.bigNumber().nullable(),
    mrp: model.bigNumber().nullable(),
    original_price: model.bigNumber().nullable(),
    tax_rate: model.float().nullable(),
    attributes: model.json().nullable(),
    raw: model.json().nullable(),
    raw_hash: model.text().nullable(),
    price_raw: model.json().nullable(),
    price_hash: model.text().nullable(),
    /** Last time the items stream changed this row. */
    item_changed_at: model.dateTime().nullable(),
    /** Last time the prices stream changed this row. */
    price_changed_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_integration_external_item_location_unique",
      on: ["seller_id", "provider_id", "item_external_id", "location_external_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default IntegrationExternalItemLocation
