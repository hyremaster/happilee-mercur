import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

export const validateSellerCategory = async (
  scope: MedusaContainer,
  sellerId: string,
  categoryId: string
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: links } = await query.graph({
    entity: "product_category_seller",
    filters: {
      seller_id: sellerId,
      product_category_id: categoryId,
    },
    fields: ["product_category_id"],
  })

  if (!links.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product category with id ${categoryId} was not found`
    )
  }
}

export const validateSellerProducts = async (
  scope: MedusaContainer,
  sellerId: string,
  productIds: string[]
) => {
  if (!productIds.length) {
    return
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: sellerProducts } = await query.graph({
    entity: "product_seller",
    filters: {
      seller_id: sellerId,
    },
    fields: ["product_id"],
  })

  const sellerProductIds = new Set(sellerProducts.map((p) => p.product_id))

  const invalidProductIds = productIds.filter((id) => !sellerProductIds.has(id))

  if (invalidProductIds.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Products with ids: ${invalidProductIds.join(", ")} were not found`
    )
  }
}
