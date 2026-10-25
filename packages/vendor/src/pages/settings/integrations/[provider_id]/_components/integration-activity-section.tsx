import { Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import { IntegrationSyncRunDTO, IntegrationSyncRunStatus } from "@mercurjs/types"
import { useTranslation } from "react-i18next"

import { useIntegrationSyncRuns } from "@hooks/api/integrations"
import { useDate } from "@hooks/use-date"

type IntegrationActivitySectionProps = {
  providerId: string
}

const statusColor = (status: IntegrationSyncRunStatus) =>
  status === IntegrationSyncRunStatus.SUCCESS
    ? "green"
    : status === IntegrationSyncRunStatus.FAILED
      ? "red"
      : "orange"

export const IntegrationActivitySection = ({
  providerId,
}: IntegrationActivitySectionProps) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()
  const { sync_runs, isPending, isError, error } = useIntegrationSyncRuns(providerId)

  if (isError) {
    throw error
  }

  const summary = (run: IntegrationSyncRunDTO) =>
    run.status === IntegrationSyncRunStatus.FAILED
      ? run.error ?? ""
      : run.counts
        ? t("integrations.detail.counts", {
            found: run.counts.found ?? 0,
            created: run.counts.created ?? 0,
            updated: run.counts.updated ?? 0,
            deactivated: run.counts.deactivated ?? 0,
          })
        : ""

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("integrations.detail.activity")}</Heading>
      </div>
      {!isPending && !sync_runs?.length && (
        <div className="px-6 py-6">
          <Text size="small" className="text-ui-fg-subtle">
            {t("integrations.detail.noActivity")}
          </Text>
        </div>
      )}
      {sync_runs?.map((run) => (
        <div
          key={run.id}
          className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 flex-col">
            <Text size="small" weight="plus" leading="compact">
              {t(`integrations.detail.stream.${run.stream}`)} ·{" "}
              {t(`integrations.detail.trigger.${run.trigger}`)}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {summary(run)}
            </Text>
          </div>
          <div className="flex shrink-0 items-center gap-x-3">
            <Text size="xsmall" className="text-ui-fg-muted">
              {getFullDate({ date: run.started_at, includeTime: true })}
            </Text>
            <StatusBadge color={statusColor(run.status)}>
              {t(`integrations.detail.runStatus.${run.status}`)}
            </StatusBadge>
          </div>
        </div>
      ))}
    </Container>
  )
}
