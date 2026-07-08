import {
  capturePaymentWorkflow,
  getOrderDetailWorkflow,
  markPaymentCollectionAsPaid,
} from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import { validateSellerOrder } from "../../../helpers"

const SYSTEM_PAYMENT_PROVIDER_ID = "pp_system_default"

type PaymentRow = {
  id: string
  captured_at: string | null
  canceled_at: string | null
}

type CollectionRow = {
  id: string
  status: string
  payment_sessions: Array<{ provider_id: string }> | null
  payments: PaymentRow[] | null
}

/**
 * Mark a Cash-on-Delivery order's payment as paid (captured/completed).
 *
 * COD orders use the Medusa "system" provider (`pp_system_default`). Depending
 * on the checkout flow the payment collection is either:
 *   - `authorized` with an uncaptured payment (cart was completed and the
 *     system session auto-authorized) — capture that payment; or
 *   - `not_paid` with no payment — run Medusa's `markPaymentCollectionAsPaid`
 *     (creates a system session, authorizes, captures).
 *
 * Both reuse Medusa's canonical workflows and update every related column:
 * payment_session (→ captured), payment (`captured_at` + capture row),
 * payment_collection (→ `completed`), the order transaction, and
 * `order.payment_status` (→ `captured`). Non-system (online) providers are
 * rejected — those capture through their provider, not manually.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorOrderResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const orderId = req.params.id
  const capturedBy = req.auth_context.actor_id

  await validateSellerOrder(req.scope, sellerId, orderId)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    filters: { id: orderId },
    fields: [
      "id",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.payment_sessions.provider_id",
      "payment_collections.payments.id",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
    ],
  })

  const collections = (order?.payment_collections ?? []) as CollectionRow[]

  // Only Cash on Delivery (system provider) collections can be settled here.
  const codCollections = collections.filter((pc) =>
    (pc.payment_sessions ?? []).some(
      (ps) => ps.provider_id === SYSTEM_PAYMENT_PROVIDER_ID
    )
  )

  if (!codCollections.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Only Cash on Delivery (system) payments can be marked as paid manually"
    )
  }

  // Prefer capturing an already-authorized, uncaptured payment.
  const capturablePayment = codCollections
    .flatMap((pc) => pc.payments ?? [])
    .find((p) => !p.captured_at && !p.canceled_at)

  if (capturablePayment) {
    await capturePaymentWorkflow(req.scope).run({
      input: {
        payment_id: capturablePayment.id,
        captured_by: capturedBy,
      },
    })
  } else {
    // No payment yet — the collection must be not_paid to mark it paid.
    const unpaid = codCollections.find((pc) => pc.status === "not_paid")

    if (!unpaid) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Order payment is already captured or cannot be marked as paid"
      )
    }

    await markPaymentCollectionAsPaid(req.scope).run({
      input: {
        order_id: orderId,
        payment_collection_id: unpaid.id,
        captured_by: capturedBy,
      },
    })
  }

  const { result } = await getOrderDetailWorkflow(req.scope).run({
    input: {
      fields: req.queryConfig.fields,
      order_id: orderId,
    },
  })

  res.json({ order: result as HttpTypes.VendorOrderResponse["order"] })
}
