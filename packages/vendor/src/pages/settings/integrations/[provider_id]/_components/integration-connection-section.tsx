import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { StoreIntegrationListItem } from "@mercurjs/types"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useDate } from "@hooks/use-date"

import { IntegrationStatusBadge } from "../../_components/integration-status-badge"

type IntegrationConnectionSectionProps = {
  integration: StoreIntegrationListItem
}

export const IntegrationConnectionSection = ({
  integration,
}: IntegrationConnectionSectionProps) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { provider, connection } = integration

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Heading>{provider.title}</Heading>
            <Badge size="2xsmall">
              {t(`integrations.category.${provider.category}`)}
            </Badge>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {provider.description}
          </Text>
          {provider.docs_url && (
            <a
              href={provider.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="txt-compact-small text-ui-fg-interactive hover:text-ui-fg-interactive-hover w-fit"
            >
              {t("integrations.docs")}
            </a>
          )}
        </div>
        <Button size="small" variant="secondary" asChild>
          <Link to="manage" data-testid="integration-manage">
            {connection
              ? t("integrations.actions.manage")
              : t("integrations.actions.connect")}
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-y-2 px-6 py-4">
        <div className="flex items-center justify-between gap-x-4">
          <Text size="small" weight="plus" leading="compact">
            {t("integrations.detail.connection")}
          </Text>
          <IntegrationStatusBadge connection={connection} />
        </div>
        {!connection && (
          <Text size="small" className="text-ui-fg-subtle">
            {t("integrations.detail.notConnectedHint", { title: provider.title })}
          </Text>
        )}
        {connection?.last_checked_at && (
          <Text size="small" className="text-ui-fg-subtle">
            {t("integrations.lastChecked", {
              date: getFullDate({ date: connection.last_checked_at, includeTime: true }),
            })}
          </Text>
        )}
        {connection?.last_error && (
          <Text size="small" className="text-ui-fg-error">
            {connection.last_error}
          </Text>
        )}
      </div>
    </Container>
  )
}
