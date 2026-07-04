import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, OrderWorkflowEvents } from "@medusajs/framework/utils"
import { capturePaymentWorkflow } from "@medusajs/core-flows"

export default async function autoCapturePaymentHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }[]>) {
  const orderIds = event.data.map((o) => o.id)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve("logger")

  for (const orderId of orderIds) {
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: [
        "id",
        "payment_collections.payments.id",
        "payment_collections.payments.provider_id",
      ],
    })

    const payments =
      orders[0]?.payment_collections?.flatMap((pc: any) => pc.payments ?? []) ?? []

    for (const payment of payments) {
      if (!payment?.id || payment.provider_id === "pp_system_default") continue

      try {
        await capturePaymentWorkflow(container).run({
          input: { payment_id: payment.id },
        })
      } catch (err: any) {
        logger.error(`Auto-capture failed for payment ${payment.id}: ${err?.message}`)
      }
    }
  }
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.PLACED,
  context: {
    subscriberId: "auto-capture-payment-handler",
  },
}
