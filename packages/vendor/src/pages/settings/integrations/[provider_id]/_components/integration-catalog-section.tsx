import { Button, Container, Heading, StatusBadge, Text, toast } from "@medusajs/ui"
import {
  HttpTypes,
  IntegrationCatalogCount,
  IntegrationProviderDTO,
  IntegrationSyncRunStatus,
  IntegrationSyncStream,
} from "@mercurjs/types"
import { useTranslation } from "react-i18next"

import {
  useIntegrationCatalogSummary,
  useRunIntegrationSync,
} from "@hooks/api/integrations"
import { useDate } from "@hooks/use-date"

const STREAMS = [
  IntegrationSyncStream.ITEMS,
  IntegrationSyncStream.PRICES,
  IntegrationSyncStream.STOCK,
]

/** Attribute breakdowns shown; the provider decides which keys exist. */
const MAX_ATTRIBUTE_LISTS = 3
const MAX_VALUES = 8

type Summary = HttpTypes.VendorIntegrationCatalogSummaryResponse["summary"]

const isRunning = (summary: Summary | undefined) =>
  STREAMS.some(
    (stream) => summary?.last_runs?.[stream]?.status === IntegrationSyncRunStatus.RUNNING
  )

const runColor = (status: IntegrationSyncRunStatus) =>
  status === IntegrationSyncRunStatus.SUCCESS
    ? "green"
    : status === IntegrationSyncRunStatus.FAILED
      ? "red"
      : "orange"

type IntegrationCatalogSectionProps = {
  provider: IntegrationProviderDTO
}

/**
 * Settings → Integrations → provider: staged catalogue counts (items, prices,
 * stock) and a "Sync catalogue" action. Nothing here publishes products; the
 * numbers support decisions on the catalogue rules.
 */
export const IntegrationCatalogSection = ({ provider }: IntegrationCatalogSectionProps) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()

  const { summary, isPending, isError, error } = useIntegrationCatalogSummary(provider.id, {
    // Catalogue streams run in the background; refresh until they finish.
    refetchInterval: (query) => {
      const data = query.state.data as HttpTypes.VendorIntegrationCatalogSummaryResponse | undefined
      return isRunning(data?.summary) ? 3000 : false
    },
  })
  const sync = useRunIntegrationSync(provider.id)

  if (isError) {
    throw error
  }

  const handleSync = async () => {
    await sync.mutateAsync(
      { stream: IntegrationSyncStream.ITEMS },
      {
        onSuccess: () => toast.success(t("integrations.detail.toasts.catalogSyncStarted")),
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const running = isRunning(summary)
  const label = (value: string | null) => value ?? t("integrations.detail.catalog.noValue")

  const stats = summary
    ? [
        {
          label: t("integrations.detail.catalog.stats.items"),
          value: summary.items,
          hint: t("integrations.detail.catalog.stats.activeItems", { count: summary.active_items }),
        },
        { label: t("integrations.detail.catalog.stats.itemLocations"), value: summary.item_locations },
        { label: t("integrations.detail.catalog.stats.stockLots"), value: summary.stock_rows },
        { label: t("integrations.detail.catalog.stats.multiLot"), value: summary.multi_lot_price_pairs },
        { label: t("integrations.detail.catalog.stats.aboveMrp"), value: summary.sale_price_above_min_lot_mrp },
        { label: t("integrations.detail.catalog.stats.spread"), value: summary.lot_price_spread_total },
      ]
    : []

  const lists: { title: string; rows: IntegrationCatalogCount[] }[] = summary
    ? [
        { title: t("integrations.detail.catalog.byStatus"), rows: summary.by_status },
        ...Object.entries(summary.by_attribute)
          .slice(0, MAX_ATTRIBUTE_LISTS)
          .map(([key, rows]) => ({
            title: t("integrations.detail.catalog.byAttribute", { key }),
            rows,
          })),
      ]
    : []

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading level="h2">{t("integrations.detail.catalog.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("integrations.detail.catalog.hint", { title: provider.title })}
          </Text>
          {!summary?.last_runs?.items && (
            <Text size="xsmall" className="text-ui-fg-muted">
              {t("integrations.detail.catalog.offPeakHint")}
            </Text>
          )}
        </div>
        <Button
          size="small"
          variant="secondary"
          onClick={handleSync}
          isLoading={sync.isPending || running}
          disabled={running}
          data-testid="integration-sync-catalog"
        >
          {t("integrations.detail.catalog.sync")}
        </Button>
      </div>

      <div className="flex flex-col gap-y-1 px-6 py-3">
        {STREAMS.map((stream) => {
          const run = summary?.last_runs?.[stream]
          const name = t(`integrations.detail.stream.${stream}`)
          return (
            <div key={stream} className="flex items-center justify-between gap-x-3">
              <Text size="small" className="text-ui-fg-subtle">
                {run
                  ? t("integrations.detail.catalog.lastRun", {
                      stream: name,
                      status: t(`integrations.detail.runStatus.${run.status}`),
                      date: getFullDate({ date: run.started_at, includeTime: true }),
                    })
                  : t("integrations.detail.catalog.neverRun", { stream: name })}
                {run?.error ? ` · ${run.error}` : ""}
              </Text>
              {run && <StatusBadge color={runColor(run.status)}>{t(`integrations.detail.runStatus.${run.status}`)}</StatusBadge>}
            </div>
          )
        })}
      </div>

      {!isPending && !summary?.items ? (
        <div className="px-6 py-6">
          <Text size="small" className="text-ui-fg-subtle">
            {t("integrations.detail.catalog.empty", { title: provider.title })}
          </Text>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 px-6 py-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-ui-bg-subtle rounded-lg px-4 py-3">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {stat.label}
                </Text>
                <Text size="large" weight="plus">
                  {stat.value.toLocaleString()}
                </Text>
                {stat.hint && (
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {stat.hint}
                  </Text>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 px-6 py-4 sm:grid-cols-2">
            {lists.map((list) => (
              <div key={list.title} className="flex min-w-0 flex-col gap-y-1">
                <Text size="small" weight="plus">
                  {list.title}
                </Text>
                {list.rows.slice(0, MAX_VALUES).map((row) => (
                  <div key={`${list.title}-${row.value}`} className="flex justify-between gap-x-3">
                    <Text size="small" className="text-ui-fg-subtle truncate">
                      {label(row.value)}
                    </Text>
                    <Text size="small">{row.count.toLocaleString()}</Text>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {summary?.attribute_pairs && summary.attribute_pairs.rows.length > 0 && (
            <div className="flex flex-col gap-y-1 px-6 py-4">
              <Text size="small" weight="plus">
                {t("integrations.detail.catalog.pairs", {
                  first: summary.attribute_pairs.keys[0],
                  second: summary.attribute_pairs.keys[1],
                })}
              </Text>
              {summary.attribute_pairs.rows.slice(0, 20).map((row) => (
                <div key={`${row.values[0]}-${row.values[1]}`} className="flex justify-between gap-x-3">
                  <Text size="small" className="text-ui-fg-subtle truncate">
                    {label(row.values[0])} · {label(row.values[1])}
                  </Text>
                  <Text size="small">{row.count.toLocaleString()}</Text>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Container>
  )
}
