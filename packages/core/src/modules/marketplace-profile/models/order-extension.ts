import { model } from "@medusajs/framework/utils"
import { StoreOrderStatusType } from "@mercurjs/types"

/**
 * Per-order marketplace extension — 1:1 with a Medusa order.
 *
 * Denormalized columns the marketplace layer adds on top of the native order.
 * `current_status` mirrors the latest StoreOrderStatusEvent so list/filter
 * views ("my orders by status") read one indexed row per order instead of
 * scanning the append-only history. Future marketplace-specific order columns
 * belong here too. `order_id`/`seller_id` are plain text cross-module
 * references (no defineLink), matching the rest of the marketplace_profile
 * module.
 */
const OrderExtension = model
  .define("OrderExtension", {
    id: model.id({ prefix: "oext" }).primaryKey(),
    order_id: model.text(),
    seller_id: model.text(),
    current_status: model.enum(StoreOrderStatusType),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_order_extension_order_id_unique",
      on: ["order_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_order_extension_seller_status",
      on: ["seller_id", "current_status"],
      where: "deleted_at IS NULL",
    },
  ])

export default OrderExtension
