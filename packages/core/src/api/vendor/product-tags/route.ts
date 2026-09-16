import { createProductTagsWorkflow } from "@medusajs/medusa/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { Link } from "@medusajs/framework/modules-sdk"
import { HttpTypes, MercurModules } from "@mercurjs/types"

import { VendorCreateProductTagBodyType } from "./validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorProductTagListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: product_tags, metadata } = await query.graph({
    entity: "product_tag",
    fields: req.queryConfig.fields,
    filters: req.filterableFields,
    pagination: req.queryConfig.pagination,
  })

  res.json({
    product_tags,
    count: metadata?.count ?? 0,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? 0,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateProductTagBodyType>,
  res: MedusaResponse<HttpTypes.VendorProductTagResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const link: Link = req.scope.resolve(ContainerRegistrationKeys.LINK)

  const { result } = await createProductTagsWorkflow(req.scope).run({
    input: { product_tags: [req.validatedBody] },
  })

  const createdTag = result[0]

  await link.create([
    {
      [Modules.PRODUCT]: { product_tag_id: createdTag.id },
      [MercurModules.SELLER]: { seller_id: sellerId },
    },
  ])

  const {
    data: [product_tag],
  } = await query.graph({
    entity: "product_tag",
    fields: req.queryConfig.fields,
    filters: { id: createdTag.id },
  })

  res.status(201).json({ product_tag })
}
