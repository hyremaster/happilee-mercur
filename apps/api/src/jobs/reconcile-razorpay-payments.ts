import { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { completeCartWithSplitOrdersWorkflow } from "@mercurjs/core/workflows"

// Minimal shape of the shared knex connection we use for a raw credential read.
type PgConnection = {
  raw: (
    sql: string,
    bindings?: unknown[]
  ) => Promise<{ rows?: Array<{ credentials?: unknown }> }>
}

/**
 * Safety net for the "paid but cart never completed" case.
 *
 * Order creation is driven by the storefront POST /store/carts/:id/complete
 * (split route). If a customer pays on Razorpay but never lands back on the
 * storefront to call /complete (closed tab, network drop, crash), the money is
 * captured at Razorpay but no order exists.
 *
 * This job periodically finds open carts that carry a *paid* Razorpay order and
 * completes them through the SAME split workflow the storefront uses. The
 * /complete route is idempotent (returns the existing order group), and this
 * job double-checks completion state, so re-runs and races are safe.
 *
 * It never uses Medusa's standard completeCartWorkflow — that would create a
 * non-split order (no per-seller orders / commissions / payouts).
 */

// Only look at recently-touched carts; older abandoned carts are left for
// manual review to avoid unbounded scans and surprise-completing stale carts.
const LOOKBACK_MS = 24 * 60 * 60 * 1000
const RAZORPAY_PROVIDER_ID = "pp_razorpay_razorpay"

type SessionRow = {
  provider_id?: string
  status?: string
  data?: { order_id?: string; seller_id?: string } | null
}
type CartRow = {
  id: string
  completed_at?: string | null
  payment_collection?: { payment_sessions?: SessionRow[] } | null
}

async function razorpayOrderIsPaid(
  knex: PgConnection,
  sellerId: string,
  orderId: string
): Promise<boolean> {
  const res = await knex.raw(
    `SELECT credentials FROM store_payment_gateway
     WHERE seller_id = ? AND gateway = 'razorpay' AND is_active = true AND deleted_at IS NULL
     LIMIT 1`,
    [sellerId]
  )
  const cred = res?.rows?.[0]?.credentials as
    | { key_id?: string; key_secret?: string }
    | undefined
  if (!cred?.key_id || !cred?.key_secret) {
    return false
  }

  const auth = Buffer.from(`${cred.key_id}:${cred.key_secret}`).toString("base64")
  const response = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!response.ok) {
    return false
  }
  const order = (await response.json()) as { amount_paid?: number }
  return (order.amount_paid ?? 0) > 0
}

export default async function reconcileRazorpayPayments(
  container: MedusaContainer
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const knex = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as PgConnection
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)

  const since = new Date(Date.now() - LOOKBACK_MS)

  // Open carts (never completed) touched recently that still carry a pending
  // Razorpay payment session.
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "completed_at",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.status",
      "payment_collection.payment_sessions.data",
    ],
    filters: {
      completed_at: null,
      updated_at: { $gte: since },
    },
  })

  let completed = 0
  let flagged = 0

  for (const cart of carts as CartRow[]) {
    if (cart.completed_at) {
      continue
    }

    const session = (cart.payment_collection?.payment_sessions ?? []).find(
      (s) =>
        s.provider_id === RAZORPAY_PROVIDER_ID &&
        s.status === "pending" &&
        !!s.data?.order_id &&
        !!s.data?.seller_id
    )
    if (!session?.data?.order_id || !session.data.seller_id) {
      continue
    }

    // Only spend a completion attempt when Razorpay confirms money was paid.
    let paid = false
    try {
      paid = await razorpayOrderIsPaid(
        knex,
        session.data.seller_id,
        session.data.order_id
      )
    } catch (e) {
      logger.warn(
        `reconcile-razorpay: failed to check order ${session.data.order_id}: ${
          (e as Error).message
        }`
      )
      continue
    }
    if (!paid) {
      continue
    }

    // Guard against a race with the storefront /complete finishing first.
    const { data: existingGroups } = await query.graph({
      entity: "order_group",
      fields: ["id"],
      filters: { cart_id: cart.id },
    })
    if (existingGroups[0]) {
      continue
    }

    const { errors } = await completeCartWithSplitOrdersWorkflow(container).run({
      input: { cart_id: cart.id },
      throwOnError: false,
    })

    if (errors?.[0]) {
      // Paid but cannot be turned into an order (inventory/delivery/etc.).
      // Surface it for manual review — a refund is likely required.
      flagged++
      logger.error(
        `reconcile-razorpay: cart ${cart.id} is PAID (razorpay order ${session.data.order_id}) but completion failed: ${errors[0].error?.message}. Manual review / refund required.`
      )
      continue
    }

    completed++
    logger.info(
      `reconcile-razorpay: recovered paid cart ${cart.id} into an order group.`
    )
  }

  if (completed || flagged) {
    logger.info(
      `reconcile-razorpay: completed ${completed}, flagged ${flagged} paid-but-unfulfillable cart(s).`
    )
  }
}

export const config = {
  name: "reconcile-razorpay-payments",
  // Every 5 minutes.
  schedule: "*/5 * * * *",
}
