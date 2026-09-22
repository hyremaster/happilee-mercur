import { model } from "@medusajs/framework/utils"
import { StoreOrderStatusType } from "@mercurjs/types"
import StoreProfile from "./store-profile"

/**
 * Per-store order-status configuration (wizard step 2).
 *
 * One row per standard status. The store owner can rename (`display_name`),
 * reorder (`rank`), and toggle (`is_active`) each status. Required rows
 * (`is_required = true`: order_placed, delivered, cancelled) stay active.
 * Seeded from DEFAULT_STORE_ORDER_STATUSES; "Reset to defaults" rewrites them.
 */
const StoreOrderStatus = model
  .define("StoreOrderStatus", {
    id: model.id({ prefix: "sostat" }).primaryKey(),
    status: model.enum(StoreOrderStatusType),
    display_name: model.text(),
    color: model.text().nullable(),
    is_active: model.boolean().default(false),
    is_required: model.boolean().default(false),
    rank: model.number().default(0),
    metadata: model.json().nullable(),
    store_profile: model.belongsTo(() => StoreProfile, {
      mappedBy: "order_statuses",
    }),
  })
  .indexes([
    {
      name: "IDX_store_order_status_profile_status_unique",
      on: ["store_profile_id", "status"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default StoreOrderStatus
