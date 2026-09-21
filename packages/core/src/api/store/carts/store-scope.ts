import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

/**
 * A cart belongs to exactly one store (docs/store-scoped-customers.md).
 *
 * `stampCartStore` records the store on the cart at create time, from the store
 * the request names. `rejectForeignStoreLineItem` then keeps the cart pure: the
 * variant being added must come from the cart's store.
 *
 * The cart's store is the one stamped at create; for carts created before this
 * (or without a store header) it is inferred from what is already in the cart.
 * An empty, unstamped cart accepts the first item from any store, and that item
 * fixes the cart's store from then on.
 */

/** Cart create: carry the request's store onto the cart as metadata.seller_id. */
export function stampCartStore(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const store = req.store_seller_context
  if (!store) {
    return next()
  }

  // Stamp both shapes: depending on middleware order the route may already
  // have produced `validatedBody`, which is what the handler reads.
  for (const target of [req.body, req.validatedBody]) {
    const body = target as { metadata?: Record<string, unknown> } | undefined
    if (body && typeof body === "object") {
      body.metadata = { ...(body.metadata ?? {}), seller_id: store.seller_id }
    }
  }

  return next()
}

/** Line-item add: refuse a variant that belongs to a different store. */
export async function rejectForeignStoreLineItem(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const variantId = (req.body as { variant_id?: string } | undefined)
      ?.variant_id
    if (!variantId) {
      return next()
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    const { data: carts } = await query.graph({
      entity: "cart",
      fields: ["id", "metadata", "items.variant.product.seller.id"],
      filters: { id: req.params.id },
    })

    const cart = carts[0] as
      | {
          metadata?: Record<string, unknown> | null
          items?: {
            variant?: { product?: { seller?: { id?: string } | null } | null } | null
          }[]
        }
      | undefined

    if (!cart) {
      return next()
    }

    const cartSellerId =
      (cart.metadata?.seller_id as string | undefined) ??
      cart.items?.map((i) => i.variant?.product?.seller?.id).find(Boolean)

    if (!cartSellerId) {
      return next()
    }

    const { data: variants } = await query.graph({
      entity: "variant",
      fields: ["id", "product.seller.id"],
      filters: { id: variantId },
    })

    const variantSellerId = (
      variants[0] as
        | { product?: { seller?: { id?: string } | null } | null }
        | undefined
    )?.product?.seller?.id

    if (variantSellerId && variantSellerId !== cartSellerId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "This item belongs to another store. A cart can only hold items from one store."
      )
    }

    return next()
  } catch (e) {
    return next(e)
  }
}
