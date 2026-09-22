import {
  updateProductCategoriesWorkflow,
  deleteProductCategoriesWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { Link } from "@medusajs/framework/modules-sdk"
import { HttpTypes, MercurModules } from "@mercurjs/types"

import { validateSellerCategory } from "../helpers"
import { VendorUpdateProductCategoryBodyType } from "../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorProductCategoryResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [product_category],
  } = await query.graph({
    entity: "product_category",
    fields: req.queryConfig.fields,
    filters: {
      id: req.params.id,
    },
  })

  if (!product_category) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product category with id ${req.params.id} was not found`
    )
  }

  res.json({ product_category })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateProductCategoryBodyType>,
  res: MedusaResponse<HttpTypes.VendorProductCategoryResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const categoryId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  await validateSellerCategory(req.scope, sellerId, categoryId)

  await updateProductCategoriesWorkflow(req.scope).run({
    input: {
      selector: { id: categoryId },
      update: req.validatedBody,
    },
  })

  const {
    data: [product_category],
  } = await query.graph({
    entity: "product_category",
    fields: req.queryConfig.fields,
    filters: { id: categoryId },
  })

  res.json({ product_category })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorProductCategoryDeleteResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const categoryId = req.params.id
  const link: Link = req.scope.resolve(ContainerRegistrationKeys.LINK)

  await validateSellerCategory(req.scope, sellerId, categoryId)

  await deleteProductCategoriesWorkflow(req.scope).run({
    input: [categoryId],
  })

  await link.dismiss([
    {
      [Modules.PRODUCT]: { product_category_id: categoryId },
      [MercurModules.SELLER]: { seller_id: sellerId },
    },
  ])

  res
    .status(200)
    .json({ id: categoryId, object: "product_category", deleted: true })
}
