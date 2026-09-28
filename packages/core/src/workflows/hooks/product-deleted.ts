import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../modules/marketplace-profile/service"

// Free the store handles of deleted products so the store can reuse them.
deleteProductsWorkflow.hooks.productsDeleted(async ({ ids }, { container }) => {
  if (!ids?.length) {
    return
  }

  const service = container.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  const rows = await service.listStoreProductHandles({ product_id: ids })
  if (rows.length) {
    await service.deleteStoreProductHandles(rows.map((r) => r.id))
  }
})
