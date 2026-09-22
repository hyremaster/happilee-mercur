import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import {
  updateCartWorkflow,
  UpdateCartWorkflowInput,
} from "@medusajs/core-flows"

import { assertCartDeliverableIfAddressPresent } from "../delivery"
import { refetchCart } from "../helpers"

// GET /store/carts/:id — same as the native route (replicated because defining
// this file overrides Medusa's built-in handler for the path).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.StoreCartResponse>
) => {
  const cart = await refetchCart(
    req.params.id,
    req.scope,
    req.queryConfig.fields
  )

  res.json({ cart })
}

// POST /store/carts/:id — overrides the native update route to add a
// delivery-availability guard: when the cart has a shipping address (existing
// or just set), every seller in it must be able to deliver there.
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.StoreUpdateCart>,
  res: MedusaResponse<HttpTypes.StoreCartResponse>
) => {
  const body = req.validatedBody as HttpTypes.StoreUpdateCart & {
    additional_data?: Record<string, unknown>
  }

  await updateCartWorkflow(req.scope).run({
    input: {
      ...body,
      id: req.params.id,
      additional_data: body.additional_data,
    } as UpdateCartWorkflowInput,
  })

  await assertCartDeliverableIfAddressPresent(req.scope, req.params.id)

  const cart = await refetchCart(
    req.params.id,
    req.scope,
    req.queryConfig.fields
  )

  res.status(200).json({ cart })
}
