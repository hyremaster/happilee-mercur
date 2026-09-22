import { model } from "@medusajs/framework/utils"
import StoreProfile from "./store-profile"

/**
 * Per-store payment configuration (wizard step 3, 1:1 with store_profile).
 *
 * Medusa has no per-store payment config (payment providers are region-scoped;
 * Mercur payout is seller->platform settlement, not customer checkout). Online
 * and COD can both be enabled. `payment_provider_id` is the chosen Medusa payment
 * provider for online payments. COD amounts use `currency_code` (store currency).
 */
const StorePaymentConfig = model.define("StorePaymentConfig", {
  id: model.id({ prefix: "spayc" }).primaryKey(),
  online_enabled: model.boolean().default(false),
  payment_provider_id: model.text().nullable(),
  cod_enabled: model.boolean().default(false),
  cod_min_amount: model.bigNumber().nullable(),
  cod_max_amount: model.bigNumber().nullable(),
  currency_code: model.text().nullable(),
  metadata: model.json().nullable(),
  store_profile: model.belongsTo(() => StoreProfile, {
    mappedBy: "payment_config",
  }),
})

export default StorePaymentConfig
