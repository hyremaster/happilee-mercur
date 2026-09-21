import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import { setVariantAvailabilityWorkflow } from "../../../../../../../workflows/variant-availability"
import { validateSellerProduct } from "../../../../helpers"
import { VendorSetVariantAvailabilityType } from "../../../../validators"

// POST /vendor/products/:id/variants/:variant_id/availability — mark a variant
// available / unavailable for sale, independent of its inventory.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorSetVariantAvailabilityType>,
  res: MedusaResponse
) => {
  const sellerId = req.seller_context!.seller_id
  const { id: productId, variant_id: variantId } = req.params

  await validateSellerProduct(req.scope, sellerId, productId)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [variant],
  } = await query.graph({
    entity: "variant",
    fields: ["id"],
    filters: { id: variantId, product_id: productId },
  })

  if (!variant) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Variant with id: ${variantId} was not found`
    )
  }

  const { result } = await setVariantAvailabilityWorkflow(req.scope).run({
    input: {
      variant_id: variantId,
      is_available: req.validatedBody.is_available,
      unavailable_until: req.validatedBody.unavailable_until ?? null,
    },
  })

  res.status(200).json({ variant_availability: result })
}
