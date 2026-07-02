import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  ProductStatus,
} from "@medusajs/framework/utils"
import { SellerStatus } from "@mercurjs/types"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id: seller_id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Confirm seller exists and is OPEN.
  const now = new Date()
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "status"],
    filters: {
      id: seller_id,
      status: SellerStatus.OPEN,
      $and: [
        { $or: [{ closed_from: null }, { closed_from: { $gt: now } }] },
        { $or: [{ closed_to: null }, { closed_to: { $lt: now } }] },
      ],
    },
  })

  if (!sellers.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Seller with id: ${seller_id} was not found or is not available`
    )
  }

  // Resolve product IDs linked to this seller via the product_seller join.
  const { data: productLinks } = await query.graph({
    entity: "product_seller",
    fields: ["product_id"],
    filters: { seller_id },
  })

  const productIds = productLinks.map(
    (l: { product_id: string }) => l.product_id
  )

  if (!productIds.length) {
    return res.json({ products: [], count: 0, offset: 0, limit: 50 })
  }

  const {
    limit = 50,
    offset = 0,
    q,
    category_id,
    collection_id,
    tag_id,
    type_id,
  } = req.query as Record<string, unknown>

  const filters: Record<string, unknown> = {
    id: productIds,
    status: ProductStatus.PUBLISHED,
  }
  if (q) filters.q = q
  if (category_id) filters.category_id = category_id
  if (collection_id) filters.collection_id = collection_id
  if (tag_id) filters.tag_id = tag_id
  if (type_id) filters.type_id = type_id

  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "description",
      "handle",
      "status",
      "thumbnail",
      "images.*",
      "options.*",
      "options.values.*",
      "variants.*",
      "variants.prices.*",
      "variants.options.*",
      "collection_id",
      "type_id",
      "created_at",
      "updated_at",
    ],
    filters,
    pagination: {
      skip: Number(offset),
      take: Number(limit),
    },
  })

  res.json({
    products,
    count: metadata?.count ?? products.length,
    offset: Number(offset),
    limit: Number(limit),
  })
}
