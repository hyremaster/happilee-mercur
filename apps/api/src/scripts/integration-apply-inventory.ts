import { ExecArgs } from "@medusajs/framework/types"
import { applyIntegrationInventoryWorkflow } from "@mercurjs/core/workflows"
import { IntegrationSyncTrigger } from "@mercurjs/types"

/**
 * Writes a store's staged stock to inventory levels, like the run that follows
 * "Update products, prices and stock". Uses staged data only; never calls the
 * provider.
 *
 *   bunx medusa exec ./src/scripts/integration-apply-inventory.ts <seller_id> [provider_id]
 */
export default async function integrationApplyInventory({ container, args }: ExecArgs) {
  const [sellerId, providerId = "gofrugal"] = args ?? []
  if (!sellerId) {
    throw new Error(
      "Usage: medusa exec ./src/scripts/integration-apply-inventory.ts <seller_id> [provider_id]"
    )
  }

  const { result } = await applyIntegrationInventoryWorkflow(container).run({
    input: {
      seller_id: sellerId,
      provider_id: providerId,
      trigger: IntegrationSyncTrigger.MANUAL,
    },
  })

  process.stdout.write(`${JSON.stringify({ status: result.run?.status, counts: result.run?.counts, error: result.run?.error })}\n`)
}
