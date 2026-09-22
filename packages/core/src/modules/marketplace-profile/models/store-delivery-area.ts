import { model } from "@medusajs/framework/utils"

/**
 * A delivery area a store serves (wizard step 2, Local delivery -> Delivery).
 *
 * Areas are chosen from the external Area Sense module (via OpenAPI). We persist
 * the selected areas locally (`area_sense_id` + `area_name` + `metadata`) so the
 * marketplace keeps its own copy and does not depend on Area Sense being
 * reachable later. `seller_id` is a plain text cross-module reference (no
 * defineLink, app-layer joins) — mirrors StorePaymentGateway.
 */
const StoreDeliveryArea = model
  .define("StoreDeliveryArea", {
    id: model.id({ prefix: "sdarea" }).primaryKey(),
    seller_id: model.text(),
    area_sense_id: model.text(),
    area_name: model.text(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_store_delivery_area_seller_area_unique",
      on: ["seller_id", "area_sense_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_store_delivery_area_seller_id",
      on: ["seller_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_store_delivery_area_deleted_at",
      on: ["deleted_at"],
      where: "deleted_at IS NULL",
    },
  ])

export default StoreDeliveryArea
