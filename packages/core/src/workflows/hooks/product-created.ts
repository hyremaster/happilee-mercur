import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { LinkDefinition } from "@medusajs/framework/types"
import { Link, Query } from "@medusajs/framework/modules-sdk"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../modules/marketplace-profile/service"
import { productsCreatedHookHandler } from "../product-attribute/utils/products-created-handler"

type HookCompensation = {
  productLinks: LinkDefinition[]
  inventoryLinks: LinkDefinition[]
  storeHandleIds: string[]
}

createProductsWorkflow.hooks.productsCreated(
  async ({ products, additional_data }, { container }) => {
    if (!additional_data?.seller_id) {
      const empty: HookCompensation = {
        productLinks: [],
        inventoryLinks: [],
        storeHandleIds: [],
      }
      return new StepResponse(empty, empty)
    }

    const link: Link = container.resolve(ContainerRegistrationKeys.LINK)
    const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)

    const links: LinkDefinition[] = []
    const inventoryLinks: LinkDefinition[] = []

    const variantIds: string[] = []

    for (const product of products) {
      links.push({
        [Modules.PRODUCT]: {
          product_id: product.id,
        },
        [MercurModules.SELLER]: {
          seller_id: additional_data.seller_id,
        },
      })

      for (const variant of product.variants || []) {
        if (variant.manage_inventory) {
          variantIds.push(variant.id)
        }
      }
    }

    if (variantIds.length) {
      const { data: variants } = await query.graph({
        entity: "variant",
        fields: ["inventory_items.inventory_item_id"],
        filters: { id: variantIds },
      })

      for (const variant of variants) {
        for (const inventoryItem of variant.inventory_items || []) {
          inventoryLinks.push({
            [Modules.INVENTORY]: {
              inventory_item_id: inventoryItem.inventory_item_id,
            },
            [MercurModules.SELLER]: {
              seller_id: additional_data.seller_id,
            },
          })
        }
      }
    }

    await link.create(links)

    if (inventoryLinks.length) {
      await link.create(inventoryLinks)
    }

    // Store-scoped handle. The vendor API passes the handle the vendor chose
    // (product.handle then holds an internal, globally unique value); anything
    // else keeps its Medusa handle as the store handle.
    const requestedStoreHandle =
      products.length === 1 && typeof additional_data.store_handle === "string"
        ? additional_data.store_handle
        : null
    const storeHandles = await container
      .resolve<MarketplaceProfileModuleService>(MercurModules.MARKETPLACE_PROFILE)
      .createStoreProductHandles(
        products.map((product) => ({
          product_id: product.id,
          seller_id: additional_data.seller_id as string,
          handle: requestedStoreHandle ?? product.handle,
        }))
      )

    // Process attribute assignments from additional_data
    await productsCreatedHookHandler({
      products,
      additional_data: additional_data as Record<string, unknown>,
      container,
    })

    const result: HookCompensation = {
      productLinks: links,
      inventoryLinks,
      storeHandleIds: storeHandles.map((h) => h.id),
    }
    return new StepResponse(result, result)
  },
  async (data, { container }) => {
    if (!data) {
      return
    }

    const { productLinks, inventoryLinks, storeHandleIds } = data

    const link: Link = container.resolve(ContainerRegistrationKeys.LINK)

    if (storeHandleIds?.length) {
      await container
        .resolve<MarketplaceProfileModuleService>(MercurModules.MARKETPLACE_PROFILE)
        .deleteStoreProductHandles(storeHandleIds)
    }

    if (productLinks?.length) {
      await link.dismiss(productLinks)
    }

    if (inventoryLinks?.length) {
      await link.dismiss(inventoryLinks)
    }
  }
)
