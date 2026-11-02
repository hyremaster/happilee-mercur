import { ExecArgs } from "@medusajs/framework/types"
import { projectIntegrationProductsWorkflow } from "@mercurjs/core/workflows"
import { IntegrationSyncTrigger } from "@mercurjs/types"

/**
 * Turns a store's staged, eligible items into draft products, like the "Create
 * draft products" button. Uses staged data only; never calls the provider.
 * `max_items` tries a first run on a few products.
 *
 *   bunx medusa exec ./src/scripts/integration-project-products.ts <seller_id> [provider_id] [max_items]
 */
export default async function integrationProjectProducts({ container, args }: ExecArgs) {
  const [sellerId, providerId = "gofrugal", maxItems] = args ?? []
  if (!sellerId) {
    throw new Error(
      "Usage: medusa exec ./src/scripts/integration-project-products.ts <seller_id> [provider_id] [max_items]"
    )
  }

  const { result } = await projectIntegrationProductsWorkflow(container).run({
    input: {
      seller_id: sellerId,
      provider_id: providerId,
      trigger: IntegrationSyncTrigger.MANUAL,
      max_items: maxItems ? Number(maxItems) : undefined,
    },
  })

  process.stdout.write(`${JSON.stringify({ status: result.run?.status, counts: result.run?.counts, error: result.run?.error })}\n`)
}
