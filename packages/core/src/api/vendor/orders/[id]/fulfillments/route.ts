import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { HttpTypes } from "@mercurjs/types"

import { repairReservedInventory } from "../../../../../utils/repair-reserved-inventory"
import { validateSellerOrder } from "../../helpers"
import { VendorCreateFulfillmentType } from "../../validators"

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateFulfillmentType>,
  res: MedusaResponse<HttpTypes.VendorFulfillmentResponse>
) => {
  const { id } = req.params
  const sellerId = req.seller_context!.seller_id

  await validateSellerOrder(req.scope, sellerId, id)

  const { result: fulfillment, errors } = await createOrderFulfillmentWorkflow(
    req.scope
  ).run({
    input: {
      order_id: id,
      created_by: sellerId,
      ...req.validatedBody,
    },
    throwOnError: false,
  })

  if (errors.length) {
    // The rollback can leave the reserved quantity too low, so fix it before
    // anyone can buy that stock. The vendor still sees the original error.
    await repairReservedInventory(req.scope)
    throw errors[0].error
  }

  res.json({ fulfillment })
}
