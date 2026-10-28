import { model } from "@medusajs/framework/utils"

/**
 * Stock per item × external location × lot, from full snapshots. `lot_key`
 * groups batches the provider can't tell apart (GoFrugal HQ: the MRP). A lot
 * missing from a complete snapshot is set to quantity 0, not deleted.
 */
const IntegrationExternalStock = model
  .define("IntegrationExternalStock", {
    id: model.id({ prefix: "intstock" }).primaryKey(),
    seller_id: model.text(),
    provider_id: model.text(),
    item_external_id: model.text(),
    location_external_id: model.text(),
    lot_key: model.text(),
    quantity: model.float().default(0),
    mrp: model.bigNumber().nullable(),
    raw: model.json().nullable(),
    raw_hash: model.text(),
    seen_at: model.dateTime(),
  })
  .indexes([
    {
      name: "IDX_integration_external_stock_unique",
      on: ["seller_id", "provider_id", "item_external_id", "location_external_id", "lot_key"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default IntegrationExternalStock
