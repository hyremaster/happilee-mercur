import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import {
  createCartWorkflow,
  CreateCartWorkflowInput,
} from "@medusajs/core-flows"

import { assertCartDeliverableIfAddressPresent } from "./delivery"
import { refetchCart } from "./helpers"

// POST /store/carts — overrides the native Medusa create route to add a
// delivery-availability guard: when the new cart carries a shipping address,
// every seller in it must be able to deliver there (same check as completion).
export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.StoreCreateCart>,
  res: MedusaResponse<HttpTypes.StoreCartResponse>
) => {
  const workflowInput = {
    ...req.validatedBody,
    customer_id: req.auth_context?.actor_id,
  } as CreateCartWorkflowInput

  const { result } = await createCartWorkflow(req.scope).run({
    input: workflowInput,
  })

  await assertCartDeliverableIfAddressPresent(req.scope, result.id)

  const cart = await refetchCart(result.id, req.scope, req.queryConfig.fields)

  res.status(200).json({ cart })
}
