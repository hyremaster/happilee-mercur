import { model } from "@medusajs/framework/utils"
import { StorePaymentGatewayType } from "@mercurjs/types"

const StorePaymentGateway = model
  .define("StorePaymentGateway", {
    id: model.id({ prefix: "spgw" }).primaryKey(),
    seller_id: model.text(),
    gateway: model.enum(StorePaymentGatewayType),
    is_active: model.boolean().default(false),
    credentials: model.json(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_store_payment_gateway_seller_gateway_unique",
      on: ["seller_id", "gateway"],
      unique: true,
      where: "deleted_at IS NULL",
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
