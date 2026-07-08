import { model } from "@medusajs/framework/utils"
import { StorePaymentGatewayType } from "@mercurjs/types"

const StorePaymentGateway = model
  .define("StorePaymentGateway", {
    id: model.id({ prefix: "spgw" }).primaryKey(),
    seller_id: model.text(),
    gateway: model.enum(StorePaymentGatewayType),
    // Human label distinguishing multiple accounts of the same gateway type
    // (e.g. "Main", "Backup"). Row identity is `id`; `label` is unique per
    // (seller_id, gateway).
    label: model.text(),
    is_active: model.boolean().default(false),
    credentials: model.json(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      // No duplicate labels for the same gateway type within a store.
      name: "IDX_store_payment_gateway_seller_gateway_label_unique",
      on: ["seller_id", "gateway", "label"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      // At most one active account per gateway type per store.
      name: "IDX_store_payment_gateway_seller_gateway_active_unique",
      on: ["seller_id", "gateway"],
      unique: true,
      where: "is_active = true AND deleted_at IS NULL",
    },
    {
      name: "IDX_store_payment_gateway_seller_id",
      on: ["seller_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_store_payment_gateway_deleted_at",
      on: ["deleted_at"],
      where: "deleted_at IS NULL",
    },
  ])

export default StorePaymentGateway
