import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { SellerStatus } from "@mercurjs/types"

/**
 * GET /store/sellers/:id/categories
 *
 * Storefront listing of the product categories that belong to a specific store
 * (seller). Vendor-created categories are scoped to their seller through the
 * `product_category_seller` link (see POST /vendor/product-categories), so a
 * public store view must resolve categories via that link rather than the
 * global Medusa catalog. Only categories of an OPEN, non-closed seller are
 * exposed, and only active, non-internal categories are returned.
 *
 * Mirrors the shape of GET /store/sellers/:id/products.
 *
 * Query params: `limit`, `offset`, `q` (name search), `parent_category_id`
 * (pass `null` for top-level only).
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

  // Resolve the category ids linked to this seller via the product_category_seller join.
  const { data: categoryLinks } = await query.graph({
    entity: "product_category_seller",
    fields: ["product_category_id"],
    filters: { seller_id },
  })

  const categoryIds = categoryLinks.map(
    (l: { product_category_id: string }) => l.product_category_id
  )

  const {
    limit = 50,
    offset = 0,
    q,
    parent_category_id,
  } = req.query as Record<string, unknown>

  if (!categoryIds.length) {
    return res.json({
      product_categories: [],
      count: 0,
      offset: Number(offset),
      limit: Number(limit),
    })
  }

  const filters: Record<string, unknown> = {
    id: categoryIds,
    is_active: true,
    is_internal: false,
  }
  if (q) {
    filters.q = q
  }
  if (parent_category_id !== undefined) {
    filters.parent_category_id =
      parent_category_id === "null" ? null : parent_category_id
  }

  const { data: product_categories, metadata } = await query.graph({
    entity: "product_category",
    fields: [
      "id",
      "name",
      "description",
      "handle",
      "rank",
      "parent_category_id",
      "is_active",
      "is_internal",
      "metadata",
      "created_at",
      "updated_at",
      "category_children.id",
      "category_children.name",
      "category_children.handle",
      "category_children.is_active",
    ],
    filters,
    pagination: {
      skip: Number(offset),
      take: Number(limit),
    },
  })

  res.json({
    product_categories,
    count: metadata?.count ?? product_categories.length,
    offset: Number(offset),
    limit: Number(limit),
  })
}
