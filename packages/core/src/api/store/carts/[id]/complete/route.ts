import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import { completeCartWithSplitOrdersWorkflow } from "../../../../../workflows/cart"
import { assertVariantsAvailable } from "../../../../../workflows/variant-availability/steps/validate-variants-available"
import { checkCartDeliveryAvailability } from "../../delivery"
import { defaultStoreCartFields, refetchCart } from "../../helpers"
import { StoreCompleteCartParamsType } from "./validators"

export const POST = async (
    req: MedusaRequest<{}, StoreCompleteCartParamsType>,
    res: MedusaResponse<HttpTypes.StoreCompleteCartResponse>
) => {
    const cart_id = req.params.id

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // Idempotency: if this cart was already completed, return its order group
    // instead of running the split workflow again (which would fail with
    // "Cannot create multiple links between 'order' and 'payment'").
    //
    // Gate on the cart's own `completed_at` — a real, filterable field. Do NOT
    // filter order_group by `cart_id`: that column is readable but NOT
    // filterable via the query graph (the filter is silently ignored and every
    // group is returned), which would short-circuit EVERY completion. Instead,
    // locate the group among the customer's groups (customer_id IS filterable)
    // by matching cart_id in-app.
    const { data: cartRows } = await query.graph({
        entity: "cart",
        fields: ["id", "completed_at", "customer_id"],
        filters: { id: cart_id },
    })
    const existingCart = cartRows[0] as
        | { completed_at?: string | null; customer_id?: string | null }
        | undefined

    if (existingCart?.completed_at) {
        const { data: customerGroups } = await query.graph({
            entity: "order_group",
            fields: [...req.queryConfig.fields, "cart_id"],
            filters: { customer_id: existingCart.customer_id },
        })
        const existing = customerGroups.find(
            (g) => (g as { cart_id?: string | null }).cart_id === cart_id
        )

        if (existing) {
            res.status(200).json({
                type: "order_group",
                order_group: existing,
            })
            return
        }
    }

    // Items the vendor marked unavailable after they entered the cart must not
    // be ordered. Checked before delivery: the shopper can act on it directly
    // (remove the item), unlike an address problem.
    const { data: cartItemRows } = await query.graph({
        entity: "cart",
        fields: ["items.variant_id"],
        filters: { id: cart_id },
    })
    const cartItems =
        (cartItemRows[0] as
            | { items?: ({ variant_id?: string | null } | null)[] }
            | undefined)?.items ?? []
    await assertVariantsAvailable(
        req.scope,
        cartItems.map((item) => item?.variant_id)
    )

    // Gate completion on Area Sense delivery availability: every seller in the
    // cart must serve the shipping location, else we stop before placing orders.
    const availability = await checkCartDeliveryAvailability(req.scope, cart_id)
    if (!availability.deliverable) {
        throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            availability.reason ??
                "Delivery is not available to the selected address."
        )
    }

    const { errors, result } = await completeCartWithSplitOrdersWorkflow(req.scope).run({
        input: { cart_id },
        throwOnError: false,
    })

    // When an error occurs on the workflow, it's potentially to do with cart validations, payments
    // or inventory checks. Return the cart here along with errors for the consumer to take more action
    // and fix them
    if (errors?.[0]) {
        const error = errors[0].error
        const statusOKErrors: string[] = [
            MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
            MedusaError.Types.PAYMENT_REQUIRES_MORE_ERROR,
        ]

        const cart = await refetchCart(
            cart_id,
            req.scope,
            defaultStoreCartFields
        )

        if (!statusOKErrors.includes(error?.type)) {
            throw error
        }

        res.status(200).json({
            type: "cart",
            cart,
            error: {
                message: error.message,
                name: error.name,
                type: error.type,
            },
        })
        return
    }

    // Fetch the order group with orders
    const { data: orderGroups } = await query.graph({
        entity: "order_group",
        fields: req.queryConfig.fields,
        filters: { id: result.order_group_id },
    })

    res.status(200).json({
        type: "order_group",
        order_group: orderGroups[0],
    })
}
