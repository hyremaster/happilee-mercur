import {
  deleteInventoryItemWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

type StagedItem = { external_id: string; product_id: string | null }
type ProductRow = {
  id: string
  title: string
  status: string
  metadata: { integration?: { seller_id?: string; provider_id?: string; external_id?: string } } | null
  variants: { inventory_items: { inventory_item_id: string }[] }[]
}
type IntegrationService = {
  listIntegrationExternalItems(
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ): Promise<StagedItem[]>
  updateIntegrationExternalItems(data: {
    selector: Record<string, unknown>
    data: Record<string, unknown>
  }): Promise<unknown>
}

/**
 * Removes draft products the product sync created for a store, with their
 * inventory items (their skus are unique across the marketplace), and clears
 * the mapping on the staged items. Skips anything not made by the sync for this
 * item, and anything no longer a draft. For undoing a sync into the wrong store.
 * Only lists what it would remove unless `apply` is passed.
 *
 *   bunx medusa exec ./src/scripts/integration-remove-synced-products.ts <seller_id> <provider_id> [apply]
 */
export default async function integrationRemoveSyncedProducts({ container, args }: ExecArgs) {
  const [sellerId, providerId, flag] = args ?? []
  if (!sellerId || !providerId) {
    throw new Error(
      "Usage: medusa exec ./src/scripts/integration-remove-synced-products.ts <seller_id> <provider_id> [apply]"
    )
  }

  const service = container.resolve(MercurModules.INTEGRATION) as unknown as IntegrationService
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const items = await service.listIntegrationExternalItems(
    { seller_id: sellerId, provider_id: providerId, product_id: { $ne: null } },
    { take: null }
  )
  const externalIdByProduct = new Map(items.map((item) => [item.product_id, item.external_id]))

  const { data } = externalIdByProduct.size
    ? await query.graph({
        entity: "product",
        fields: [
          "id",
          "title",
          "status",
          "metadata",
          "variants.inventory_items.inventory_item_id",
        ],
        filters: { id: [...externalIdByProduct.keys()] as string[] },
      })
    : { data: [] }

  const removable = (data as unknown as ProductRow[]).filter((product) => {
    const stored = product.metadata?.integration
    return (
      product.status === "draft" &&
      stored?.seller_id === sellerId &&
      stored.provider_id === providerId &&
      stored.external_id === externalIdByProduct.get(product.id)
    )
  })

  for (const product of removable) {
    process.stdout.write(`${product.id}  ${product.title}\n`)
  }
  const skipped = externalIdByProduct.size - removable.length

  if (flag !== "apply") {
    process.stdout.write(`Dry run: would remove ${removable.length} products, skip ${skipped}.\n`)
    return
  }

  if (removable.length) {
    const inventoryItemIds = removable.flatMap((product) =>
      product.variants.flatMap((variant) =>
        variant.inventory_items.map((inventoryItem) => inventoryItem.inventory_item_id)
      )
    )
    await deleteProductsWorkflow(container).run({
      input: { ids: removable.map((product) => product.id) },
    })
    await deleteInventoryItemWorkflow(container).run({ input: inventoryItemIds })
    await service.updateIntegrationExternalItems({
      selector: {
        seller_id: sellerId,
        provider_id: providerId,
        external_id: removable.map((product) => externalIdByProduct.get(product.id)),
      },
      data: {
        product_id: null,
        variant_id: null,
        projection_error: null,
        projection_pending: false,
      },
    })
  }

  process.stdout.write(`Removed ${removable.length} products, skipped ${skipped}.\n`)
}
