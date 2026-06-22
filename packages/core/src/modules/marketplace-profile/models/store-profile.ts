import { model } from "@medusajs/framework/utils"
import { StoreCommerceType, StoreIndustry, StoreStorefrontTemplate } from "@mercurjs/types"
import StoreOrderStatus from "./store-order-status"
import StorePaymentConfig from "./store-payment-config"

/**
 * Extension table for a Mercur Seller ("Store").
 *
 * Holds marketplace-specific onboarding details that are not part of the base
 * Mercur seller schema. `seller_id` is a plain text reference to the core Seller
 * id (no defineLink, no cross-module DB FK — Medusa modules own their own
 * schema). Joins to the core Seller are done in the application layer. This
 * mirrors the `reference_id` pattern used by commission/subscription modules.
 *
 * `order_statuses` is an intra-module relation, so it uses a real FK.
 */
const StoreProfile = model
  .define("StoreProfile", {
    id: model.id({ prefix: "storeprof" }).primaryKey(),
    seller_id: model.text(),
    industry: model.enum(StoreIndustry).nullable(),
    commerce_type: model.enum(StoreCommerceType).nullable(),
    // Array of StoreFulfillmentMethod values (multi-select, wizard step 2).
    fulfillment_methods: model.json().nullable(),
    // Storefront design template (wizard step 4). The storefront URL slug reuses
    // the native Seller.handle; only the template choice is stored here.
    storefront_template: model.enum(StoreStorefrontTemplate).nullable(),
    metadata: model.json().nullable(),
    order_statuses: model.hasMany(() => StoreOrderStatus, {
      mappedBy: "store_profile",
    }),
    payment_config: model.hasOne(() => StorePaymentConfig, {
      mappedBy: "store_profile",
    }),
  })
  .cascades({
    delete: ["order_statuses", "payment_config"],
  })
  .indexes([
    {
      name: "IDX_store_profile_seller_id_unique",
      on: ["seller_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default StoreProfile
