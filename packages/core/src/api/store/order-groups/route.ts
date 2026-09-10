import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.StoreOrderGroupListResponse>
) => {
  const customerId = req.auth_context.actor_id

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // `seller_id` is a virtual filter: the seller lives on the child orders, not
  // the order_group, so pull it out and resolve the seller's order-group ids
  // separately, then constrain the (customer-scoped) order_group query by id.
  const { seller_id, ...filterable } = req.filterableFields as {
    seller_id?: string
  } & Record<string, unknown>

  const filters: Record<string, unknown> = {
    ...filterable,
    customer_id: customerId,
  }

  if (seller_id) {
    const { data: sellers } = await query.graph({
      entity: "seller",
      filters: { id: seller_id },
      fields: ["orders.order_group.id"],
    })
    const groupIds = [
      ...new Set(
        (
          (sellers[0]?.orders ?? []) as Array<{
            order_group?: { id?: string } | null
          }>
        )
          .map((o) => o.order_group?.id)
          .filter((id): id is string => !!id)
      ),
    ]

    if (!groupIds.length) {
      res.json({
        order_groups: [],
        count: 0,
        offset: req.queryConfig.pagination.skip ?? 0,
        limit: req.queryConfig.pagination.take ?? 0,
      })
      return
    }

    // Intersect with any client-supplied `id` filter; otherwise scope to the
    // seller's groups. `customer_id` below still restricts to this customer.
    filters.id = groupIds
  }

  const { data: order_groups, metadata } = await query.graph({
    entity: "order_group",
    filters,
    fields: req.queryConfig.fields,
    pagination: req.queryConfig.pagination,
  })

  res.json({
    order_groups,
    count: metadata?.count ?? 0,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? 0,
  })
}
