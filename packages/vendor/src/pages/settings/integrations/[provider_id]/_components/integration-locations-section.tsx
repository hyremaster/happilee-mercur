import {
  Button,
  Container,
  Heading,
  Select,
  StatusBadge,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import {
  HttpTypes,
  IntegrationLocationDTO,
  IntegrationLocationStatus,
  IntegrationProviderDTO,
  IntegrationSyncRunStatus,
  IntegrationSyncStream,
} from "@mercurjs/types"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  useCreateBranchFromLocation,
  useIntegrationLocations,
  useRunIntegrationSync,
  useUpdateIntegrationLocation,
} from "@hooks/api/integrations"
import { useStockLocations } from "@hooks/api/stock-locations"
import { useDate } from "@hooks/use-date"

const NOT_MAPPED = "__not_mapped__"

type IntegrationLocationsSectionProps = {
  provider: IntegrationProviderDTO
}

export const IntegrationLocationsSection = ({
  provider,
}: IntegrationLocationsSectionProps) => {
  const { t } = useTranslation()
  const { getFullDate } = useDate()

  const { locations, last_run, isPending, isError, error } = useIntegrationLocations(
    provider.id,
    {
      // Right after connecting, the first sync runs in the background.
      refetchInterval: (query) => {
        const data = query.state.data as
          | HttpTypes.VendorIntegrationLocationListResponse
          | undefined
        return data?.last_run ? false : 3000
      },
    }
  )
  const { stock_locations } = useStockLocations({ limit: 200 })

  const sync = useRunIntegrationSync(provider.id)
  const update = useUpdateIntegrationLocation(provider.id)
  const createBranch = useCreateBranchFromLocation(provider.id)

  /** Branch id → the external location it is mapped to. */
  const mappedBy = useMemo(() => {
    const map = new Map<string, IntegrationLocationDTO>()
    for (const location of locations ?? []) {
      if (location.stock_location_id) {
        map.set(location.stock_location_id, location)
      }
    }
    return map
  }, [locations])

  if (isError) {
    throw error
  }

  const handleSync = async () => {
    await sync.mutateAsync(
      { stream: IntegrationSyncStream.LOCATIONS },
      {
        onSuccess: ({ run }) => {
          if (run.status === IntegrationSyncRunStatus.FAILED) {
            toast.error(
              t("integrations.detail.toasts.syncFailed", { message: run.error ?? "" })
            )
          } else {
            toast.success(
              t("integrations.detail.toasts.synced", { found: run.counts?.found ?? 0 })
            )
          }
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const handleMap = async (location: IntegrationLocationDTO, value: string) => {
    await update.mutateAsync(
      {
        location_id: location.id,
        stock_location_id: value === NOT_MAPPED ? null : value,
      },
      {
        onSuccess: () => toast.success(t("integrations.detail.toasts.mappingSaved")),
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const handleCreateBranch = async (location: IntegrationLocationDTO) => {
    await createBranch.mutateAsync(
      { location_id: location.id },
      {
        onSuccess: ({ location: created }) =>
          toast.success(
            t("integrations.detail.toasts.branchCreated", {
              name: created.stock_location?.name ?? created.name,
            })
          ),
        onError: (e) => toast.error(e.message),
      }
    )
  }

  const emptyText = last_run
    ? t("integrations.detail.noLocations", { title: provider.title })
    : t("integrations.detail.waitingFirstSync", { title: provider.title })

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-y-1">
          <Heading level="h2">
            {t("integrations.detail.locations")}
            {locations?.length ? ` (${locations.length})` : ""}
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("integrations.detail.locationsHint", { title: provider.title })}
          </Text>
          {last_run && (
            <Text size="xsmall" className="text-ui-fg-muted">
              {t("integrations.detail.lastSync", {
                date: getFullDate({ date: last_run.started_at, includeTime: true }),
              })}
              {last_run.status === IntegrationSyncRunStatus.FAILED && last_run.error
                ? ` · ${last_run.error}`
                : ""}
            </Text>
          )}
        </div>
        <Button
          size="small"
          variant="secondary"
          onClick={handleSync}
          isLoading={sync.isPending}
          data-testid="integration-sync-locations"
        >
          {t("integrations.detail.syncLocations")}
        </Button>
      </div>

      {!isPending && !locations?.length ? (
        <div className="px-6 py-6">
          <Text size="small" className="text-ui-fg-subtle">
            {emptyText}
          </Text>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("integrations.detail.columns.location")}</Table.HeaderCell>
                <Table.HeaderCell>{t("integrations.detail.columns.city")}</Table.HeaderCell>
                <Table.HeaderCell>{t("integrations.detail.columns.status")}</Table.HeaderCell>
                <Table.HeaderCell>{t("integrations.detail.columns.branch")}</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(locations ?? []).map((location) => (
                <Table.Row
                  key={location.id}
                  data-testid={`integration-location-${location.external_id}`}
                >
                  <Table.Cell>
                    <div className="flex flex-col">
                      <Text size="small" weight="plus" leading="compact">
                        {location.name}
                      </Text>
                      {location.code && (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {location.code}
                        </Text>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>{location.city ?? "-"}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge
                      color={
                        location.status === IntegrationLocationStatus.ACTIVE ? "green" : "grey"
                      }
                    >
                      {t(`integrations.detail.locationStatus.${location.status}`)}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell className="min-w-[200px]">
                    <Select
                      size="small"
                      value={location.stock_location_id ?? NOT_MAPPED}
                      onValueChange={(value) => handleMap(location, value)}
                      disabled={update.isPending}
                    >
                      <Select.Trigger>
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value={NOT_MAPPED}>
                          {t("integrations.detail.notMapped")}
                        </Select.Item>
                        {(stock_locations ?? []).map((branch) => {
                          const owner = mappedBy.get(branch.id)
                          return (
                            <Select.Item
                              key={branch.id}
                              value={branch.id}
                              disabled={!!owner && owner.id !== location.id}
                            >
                              {branch.name}
                              {owner && owner.id !== location.id ? ` · ${owner.name}` : ""}
                            </Select.Item>
                          )
                        })}
                      </Select.Content>
                    </Select>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {location.stock_location_id ? (
                      <Button size="small" variant="transparent" asChild>
                        <Link to={`/settings/locations/${location.stock_location_id}`}>
                          {t("integrations.detail.viewBranch")}
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => handleCreateBranch(location)}
                        isLoading={
                          createBranch.isPending &&
                          createBranch.variables?.location_id === location.id
                        }
                      >
                        {t("integrations.detail.createBranch")}
                      </Button>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </Container>
  )
}
