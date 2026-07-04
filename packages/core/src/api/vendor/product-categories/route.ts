import { createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { Link } from "@medusajs/framework/modules-sdk"
import { HttpTypes } from "@mercurjs/types"
import { MercurModules } from "@mercurjs/types"

import { VendorCreateProductCategoryBodyType } from "./validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorProductCategoryListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: product_categories, metadata } = await query.graph({
    entity: "product_category",
    fields: req.queryConfig.fields,
    filters: req.filterableFields,
    pagination: req.queryConfig.pagination,
  })

  res.json({
    product_categories,
    count: metadata?.count ?? 0,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? 0,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateProductCategoryBodyType>,
  res: MedusaResponse<HttpTypes.VendorProductCategoryResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const link: Link = req.scope.resolve(ContainerRegistrationKeys.LINK)

  const { result } = await createProductCategoriesWorkflow(req.scope).run({
    input: { product_categories: [req.validatedBody] },
  })

  const createdCategory = result[0]

  await link.create([
    {
      [Modules.PRODUCT]: { product_category_id: createdCategory.id },
      [MercurModules.SELLER]: { seller_id: sellerId },
    },
  ])

  const {
    data: [product_category],
  } = await query.graph({
    entity: "product_category",
    fields: req.queryConfig.fields,
    filters: { id: createdCategory.id },
  })

  res.status(201).json({ product_category })
}
