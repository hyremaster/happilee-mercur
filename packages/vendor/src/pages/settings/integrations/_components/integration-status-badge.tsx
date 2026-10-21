import { StatusBadge } from "@medusajs/ui"
import { StoreIntegrationDTO, StoreIntegrationStatus } from "@mercurjs/types"
import { useTranslation } from "react-i18next"

type IntegrationStatusBadgeProps = {
  connection: StoreIntegrationDTO | null
}

export const IntegrationStatusBadge = ({
  connection,
}: IntegrationStatusBadgeProps) => {
  const { t } = useTranslation()

  if (!connection) {
    return <StatusBadge color="grey">{t("integrations.status.notConnected")}</StatusBadge>
  }

  if (!connection.is_enabled) {
    return <StatusBadge color="grey">{t("integrations.status.disabled")}</StatusBadge>
  }

  switch (connection.status) {
    case StoreIntegrationStatus.CONNECTED:
      return <StatusBadge color="green">{t("integrations.status.connected")}</StatusBadge>
    case StoreIntegrationStatus.ERROR:
      return <StatusBadge color="red">{t("integrations.status.error")}</StatusBadge>
    default:
      return <StatusBadge color="orange">{t("integrations.status.untested")}</StatusBadge>
  }
}
