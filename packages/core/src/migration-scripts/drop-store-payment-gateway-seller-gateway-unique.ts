import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Allow multiple payment-gateway rows per seller (same gateway type), so
 * add/edit/delete can sync a full `payment_gateways` array.
 */
export default async function dropStorePaymentGatewaySellerGatewayUnique({
  container,
}: ExecArgs) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  await knex.transaction(async (trx: { raw: (sql: string) => Promise<unknown> }) => {
    await trx.raw(
      `DROP INDEX IF EXISTS "IDX_store_payment_gateway_seller_gateway_unique"`
    )
  })
}
