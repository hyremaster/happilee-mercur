import { model } from "@medusajs/framework/utils"
import { StoreOrderStatusType } from "@mercurjs/types"

/**
 * Append-only history of a marketplace order-status change.
 *
 * A seller order's current marketplace status is the `status` of its most recent
 * event (ordered by `created_at`); the full list powers the timeline on the
 * vendor order details page. `order_id` and `seller_id` are plain text
 * cross-module references (no defineLink), matching the rest of the
 * marketplace_profile module. `changed_by` is the acting member id.
 */
const StoreOrderStatusEvent = model
  .define("StoreOrderStatusEvent", {
    id: model.id({ prefix: "soevt" }).primaryKey(),
    order_id: model.text(),
    seller_id: model.text(),
    status: model.enum(StoreOrderStatusType),
    changed_by: model.text().nullable(),
    note: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_store_order_status_event_order_id",
      on: ["order_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_store_order_status_event_seller_id",
      on: ["seller_id"],
      where: "deleted_at IS NULL",
    },
  ])

export default StoreOrderStatusEvent
