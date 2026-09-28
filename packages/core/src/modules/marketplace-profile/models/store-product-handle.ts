import { model } from "@medusajs/framework/utils"

/**
 * A product's handle within its store.
 *
 * Medusa's `product.handle` is unique across the whole marketplace, so two
 * stores could not both sell a "laddoo". This table holds the handle the vendor
 * chose, unique per store; `product.handle` keeps an internal, globally unique
 * value. `product_id` and `seller_id` are plain text references (no defineLink,
 * no cross-module DB FK).
 */
const StoreProductHandle = model
  .define("StoreProductHandle", {
    id: model.id({ prefix: "sprodh" }).primaryKey(),
    product_id: model.text(),
    seller_id: model.text(),
    handle: model.text(),
  })
  .indexes([
    {
      name: "IDX_store_product_handle_product_id_unique",
      on: ["product_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_store_product_handle_seller_handle_unique",
      on: ["seller_id", "handle"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default StoreProductHandle
