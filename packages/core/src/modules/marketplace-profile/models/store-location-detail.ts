import { model } from "@medusajs/framework/utils"

/**
 * Per-location extras layered on a Medusa StockLocation (wizard step 3).
 *
 * The fulfillment centre itself (name, address, city/state/pincode/country) is a
 * native Medusa StockLocation — already seller-scoped by Mercur and served by the
 * existing vendor stock-locations API. This table only adds the fields Medusa
 * lacks: the Active/Inactive toggle and the map-pin coordinates.
 *
 * `stock_location_id` is a plain text cross-module reference (no defineLink, no
 * DB FK), joined in the application layer.
 */
const StoreLocationDetail = model
  .define("StoreLocationDetail", {
    id: model.id({ prefix: "slocdet" }).primaryKey(),
    stock_location_id: model.text(),
    is_active: model.boolean().default(true),
    latitude: model.float().nullable(),
    longitude: model.float().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_store_location_detail_stock_location_id_unique",
      on: ["stock_location_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default StoreLocationDetail
