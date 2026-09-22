import { HttpTypes } from "@medusajs/types"
import {
  Button,
  Container,
  Heading,
  Select,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  StoreOrderStatusConfig,
  useOrderStoreStatus,
  useUpdateOrderStoreStatus,
} from "@hooks/api/orders"
import { useDate } from "@hooks/use-date"

type OrderStoreStatusSectionProps = {
  order: HttpTypes.AdminOrder
}

const StatusLabel = ({
  config,
  fallback,
}: {
  config?: StoreOrderStatusConfig
  fallback: string
}) => (
  <div className="flex items-center gap-x-2">
    <span
      className="size-2 rounded-full"
      style={{ backgroundColor: config?.color ?? "#71717A" }}
    />
    <Text size="small" className="text-ui-fg-base">
      {config?.display_name ?? fallback}
    </Text>
  </div>
)

export const OrderStoreStatusSection = ({
  order,
}: OrderStoreStatusSectionProps) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { getFullDate } = useDate()
  const [selected, setSelected] = useState<string>("")

  const { data, isLoading } = useOrderStoreStatus(order.id)
  const { mutateAsync, isPending } = useUpdateOrderStoreStatus(order.id)

  if (isLoading || !data) {
    return null
  }

  const byStatus = new Map<string, StoreOrderStatusConfig>(
    data.statuses.map((s) => [s.status, s])
  )
  const currentConfig = byStatus.get(data.current)
  const isTerminal = data.allowed_next.length === 0

  const handleUpdate = async () => {
    if (!selected) {
      return
    }

    if (selected === "cancelled") {
      const confirmed = await prompt({
        title: t("orders.storeStatus.cancelTitle"),
        description: t("orders.storeStatus.cancelWarning", {
          id: `#${order.display_id}`,
        }),
        confirmText: t("actions.continue"),
        cancelText: t("actions.cancel"),
      })

      if (!confirmed) {
        return
      }
    }

    await mutateAsync(
      { status: selected },
      {
        onSuccess: () => {
          toast.success(t("orders.storeStatus.updated"))
          setSelected("")
        },
        onError: (e) => {
          toast.error(e.message)
        },
      }
    )
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("orders.storeStatus.title")}</Heading>
        <StatusLabel config={currentConfig} fallback={data.current} />
      </div>

      {isTerminal ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("orders.storeStatus.terminal")}
          </Text>
        </div>
      ) : (
        <div className="flex items-center gap-x-2 px-6 py-4">
          <div className="flex-1">
            <Select value={selected} onValueChange={setSelected}>
              <Select.Trigger>
                <Select.Value
                  placeholder={t("orders.storeStatus.selectPlaceholder")}
                />
              </Select.Trigger>
              <Select.Content>
                {data.allowed_next.map((status) => (
                  <Select.Item key={status} value={status}>
                    {byStatus.get(status)?.display_name ?? status}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <Button
            size="small"
            onClick={handleUpdate}
            isLoading={isPending}
            disabled={!selected}
          >
            {t("orders.storeStatus.update")}
          </Button>
        </div>
      )}

      {data.history.length > 0 && (
        <div className="px-6 py-4">
          <Text
            size="small"
            weight="plus"
            className="mb-3 text-ui-fg-subtle"
          >
            {t("orders.storeStatus.history")}
          </Text>
          <ul className="flex flex-col gap-y-3">
            {data.history.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-x-2"
              >
                <StatusLabel
                  config={byStatus.get(event.status)}
                  fallback={event.status}
                />
                <Text size="small" className="text-ui-fg-subtle text-nowrap">
                  {getFullDate({ date: event.created_at, includeTime: true })}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Container>
  )
}
