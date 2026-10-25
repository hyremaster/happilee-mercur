import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useIntegrations } from "@hooks/api/integrations"
import { useDate } from "@hooks/use-date"

import { IntegrationStatusBadge } from "./integration-status-badge"

export const IntegrationList = () => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { integrations, isPending, isError, error } = useIntegrations()

  if (isError) {
    throw error
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading>{t("integrations.domain")}</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          {t("integrations.subtitle")}
        </Text>
      </div>

      {!isPending && !integrations?.length && (
        <div className="px-6 py-6">
          <Text className="text-ui-fg-subtle" size="small">
            {t("integrations.empty")}
          </Text>
        </div>
      )}

      {integrations?.map(({ provider, connection }) => (
        <div
          key={provider.id}
          className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid={`integration-row-${provider.id}`}
        >
          <div className="flex min-w-0 flex-col gap-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Text size="small" weight="plus" leading="compact">
                {provider.title}
              </Text>
              <Badge size="2xsmall">
                {t(`integrations.category.${provider.category}`)}
              </Badge>
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {provider.description}
            </Text>
            {connection?.last_checked_at && (
              <Text size="xsmall" className="text-ui-fg-muted">
                {t("integrations.lastChecked", {
                  date: getFullDate({
                    date: connection.last_checked_at,
                    includeTime: true,
                  }),
                })}
              </Text>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-x-3">
            <IntegrationStatusBadge connection={connection} />
            <Button size="small" variant="secondary" asChild>
              <Link
                to={connection ? provider.id : `${provider.id}/manage`}
                data-testid={`integration-open-${provider.id}`}
              >
                {connection
                  ? t("integrations.actions.manage")
                  : t("integrations.actions.connect")}
              </Link>
            </Button>
          </div>
        </div>
      ))}
    </Container>
  )
}
