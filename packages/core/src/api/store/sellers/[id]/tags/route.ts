import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { SellerStatus } from "@mercurjs/types"

/**
 * GET /store/sellers/:id/tags
 *
 * Storefront listing of the product tags that belong to a specific store
 * (seller). Vendor-created tags are scoped to their seller through the
 * `product_tag_seller` link (see POST /vendor/product-tags), so a public store
 * view resolves tags via that link rather than the global Medusa catalog. Only
 * tags of an OPEN, non-closed seller are exposed.
 *
 * Mirrors GET /store/sellers/:id/categories.
 *
 * Query params: `limit`, `offset`, `q` (value search), `value` (exact match).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id: seller_id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Confirm the seller exists and is currently OPEN (outside any closure window).
  const now = new Date()
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id"],
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

  // Resolve the tag ids linked to this seller via the product_tag_seller join.
  const { data: tagLinks } = await query.graph({
    entity: "product_tag_seller",
    fields: ["product_tag_id"],
    filters: { seller_id },
  })

  const tagIds = tagLinks.map((l: { product_tag_id: string }) => l.product_tag_id)

  const {
    limit = 50,
    offset = 0,
    q,
    value,
  } = req.query as Record<string, unknown>

  if (!tagIds.length) {
    return res.json({
      product_tags: [],
      count: 0,
      offset: Number(offset),
      limit: Number(limit),
    })
  }

  const filters: Record<string, unknown> = { id: tagIds }
  if (q) {
    filters.q = q
  }
  if (value) {
    filters.value = value
  }

  const { data: product_tags, metadata } = await query.graph({
    entity: "product_tag",
    fields: ["id", "value", "metadata", "created_at", "updated_at"],
    filters,
    pagination: {
      skip: Number(offset),
      take: Number(limit),
    },
  })

  res.json({
    product_tags,
    count: metadata?.count ?? product_tags.length,
    offset: Number(offset),
    limit: Number(limit),
  })
}
