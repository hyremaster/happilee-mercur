import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  resolveOrderStoreStatusContext,
  updateOrderStoreStatusWorkflow,
} from "../../../../../workflows/marketplace-profile"
import { validateSellerOrder } from "../../helpers"
import { VendorUpdateOrderStoreStatusType } from "../../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { id } = req.params
  const sellerId = req.seller_context!.seller_id

  await validateSellerOrder(req.scope, sellerId, id)

  const context = await resolveOrderStoreStatusContext(req.scope, sellerId, id)

  res.json({
    current: context.current,
    allowed_next: context.allowed_next,
    statuses: context.statuses,
    history: context.history,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateOrderStoreStatusType>,
  res: MedusaResponse
) => {
  const { id } = req.params
  const sellerId = req.seller_context!.seller_id
  const memberId = req.auth_context.actor_id

  await validateSellerOrder(req.scope, sellerId, id)

  await updateOrderStoreStatusWorkflow(req.scope).run({
    input: {
      order_id: id,
      seller_id: sellerId,
      status: req.validatedBody.status,
      changed_by: memberId,
      note: req.validatedBody.note ?? null,
    },
  })

  const context = await resolveOrderStoreStatusContext(req.scope, sellerId, id)

  res.json({
    current: context.current,
    allowed_next: context.allowed_next,
    statuses: context.statuses,
    history: context.history,
  })
}
