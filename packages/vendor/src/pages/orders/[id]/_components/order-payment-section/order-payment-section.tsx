import { HttpTypes } from "@medusajs/types"
import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"

import { useTranslation } from "react-i18next"

import { useMarkOrderPaymentAsPaid } from "@hooks/api/orders"
import { getStylizedAmount } from "@lib/money-amount-helpers"
import { getOrderPaymentStatus } from "@lib/order-helpers"
import { getTotalCaptured, getTotalPending } from "@lib/payment"

const SYSTEM_PAYMENT_PROVIDER_ID = "pp_system_default"

/**
 * True when the order has a Cash-on-Delivery (system provider) payment
 * collection that still needs capturing — either `not_paid` (no payment yet) or
 * an authorized collection with an uncaptured payment. Only these can be marked
 * paid manually.
 */
const getCodCapturableCollection = (order: HttpTypes.AdminOrder) => {
  return order.payment_collections?.find((pc) => {
    const status = (pc as { status?: string }).status
    const sessions =
      (pc as { payment_sessions?: Array<{ provider_id: string }> })
        .payment_sessions ?? []
    const payments = (pc.payments ?? []) as Array<{
      captured_at?: string | null
      canceled_at?: string | null
    }>

    const isCod = sessions.some(
      (ps) => ps.provider_id === SYSTEM_PAYMENT_PROVIDER_ID
    )
    if (!isCod) {
      return false
    }

    const hasUncapturedPayment = payments.some(
      (p) => !p.captured_at && !p.canceled_at
    )

    return status === "not_paid" || hasUncapturedPayment
  })
}

type OrderPaymentSectionProps = {
  order: HttpTypes.AdminOrder
}

export const getPaymentsFromOrder = (order: HttpTypes.AdminOrder) => {
  return order.payment_collections
    ?.map((collection: HttpTypes.AdminPaymentCollection) => collection.payments)
    .flat(1)
    .filter(Boolean) as HttpTypes.AdminPayment[]
}

export const OrderPaymentSection = ({ order }: OrderPaymentSectionProps) => {
  return (
    <Container className="divide-y divide-dashed p-0">
      <Header order={order} />
      <Total order={order} />
    </Container>
  )
}

const Header = ({ order }: { order: HttpTypes.AdminOrder }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()

  const codCapturable =
    order.status !== "canceled" ? getCodCapturableCollection(order) : undefined

  const { mutateAsync, isPending } = useMarkOrderPaymentAsPaid(order.id)

  const handleMarkAsPaid = async () => {
    const confirmed = await prompt({
      title: t("orders.payment.markAsPaidConfirmTitle"),
      description: t("orders.payment.markAsPaidConfirmBody"),
      confirmText: t("orders.payment.markAsPaid"),
      cancelText: t("actions.cancel"),
    })

    if (!confirmed) {
      return
    }

    await mutateAsync(undefined, {
      onSuccess: () => toast.success(t("orders.payment.markedAsPaid")),
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <Heading level="h2">{t("orders.payment.title")}</Heading>

      <div className="flex items-center gap-x-2">
        {codCapturable && (
          <Button
            size="small"
            variant="secondary"
            isLoading={isPending}
            onClick={handleMarkAsPaid}
          >
            {t("orders.payment.markAsPaid")}
          </Button>
        )}

        {order.payment_status && (
          <StatusBadge
            color={getOrderPaymentStatus(t, order.payment_status).color}
            className="text-nowrap"
          >
            {getOrderPaymentStatus(t, order.payment_status).label}
          </StatusBadge>
        )}
      </div>
    </div>
  )
}

const Total = ({ order }: { order: HttpTypes.AdminOrder }) => {
  const { t } = useTranslation()

  if (!order.payment_collections?.length) {
    return null
  }

  const paymentCollections = order.payment_collections
  const totalCaptured = getTotalCaptured(paymentCollections)
  const totalPending = getTotalPending(paymentCollections)
  const totalRefunded = paymentCollections.reduce(
    (acc, pc) => acc + ((pc.refunded_amount as number) || 0),
    0
  )

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4">
        <Text size="small" weight="plus" leading="compact">
          {t("orders.payment.totalPaidByCustomer")}
        </Text>

        <Text size="small" weight="plus" leading="compact">
          {getStylizedAmount(totalCaptured, order.currency_code)}
        </Text>
      </div>

      {totalRefunded > 0 && (
        <div className="flex items-center justify-between px-6 py-4">
          <Text size="small" weight="plus" leading="compact">
            {t("orders.payment.totalRefunded")}
          </Text>

          <Text size="small" weight="plus" leading="compact">
            {getStylizedAmount(totalRefunded, order.currency_code)}
          </Text>
        </div>
      )}

      {order.status !== "canceled" && totalPending > 0 && (
        <div className="flex items-center justify-between px-6 py-4">
          <Text size="small" weight="plus" leading="compact">
            {t("orders.payment.totalPending")}
          </Text>

          <Text size="small" weight="plus" leading="compact">
            {getStylizedAmount(totalPending, order.currency_code)}
          </Text>
        </div>
      )}
    </div>
  )
}
