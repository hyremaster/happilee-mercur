import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import {
  IntegrationSyncRunStatus,
  IntegrationSyncTrigger,
  MercurModules,
} from "@mercurjs/types"

import type IntegrationModuleService from "../../../modules/integration/service"
import type {
  IntegrationSyncRunRow,
  StoreIntegrationRow,
} from "../../../modules/integration/service"
import {
  INTEGRATION_SYNC_STREAMS,
  IntegrationSyncStreamDefinition,
} from "./sync-streams"

const MINUTE = 60_000

/** True when the stream should run now, given its latest run. */
export function isStreamDue(
  definition: IntegrationSyncStreamDefinition,
  latest: Pick<IntegrationSyncRunRow, "status" | "started_at"> | null,
  now: Date = new Date()
): boolean {
  if (!latest) {
    return true
  }
  if (latest.status === IntegrationSyncRunStatus.RUNNING) {
    return false
  }
  const waitMinutes =
    latest.status === IntegrationSyncRunStatus.FAILED
      ? definition.retry_after_failure_minutes
      : definition.interval_minutes
  return now.getTime() - new Date(latest.started_at).getTime() >= waitMinutes * MINUTE
}

/**
 * Run every due sync stream for every enabled store connection, one at a
 * time (external APIs are rate-limited). A failing store never stops the
 * others: each run records its own error.
 */
export async function runDueIntegrationSyncs(
  container: MedusaContainer,
  now: Date = new Date()
): Promise<{ ran: number; skipped: number }> {
  const service = container.resolve<IntegrationModuleService>(MercurModules.INTEGRATION)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const connections = (await service.listStoreIntegrations({
    is_enabled: true,
  })) as StoreIntegrationRow[]

  let ran = 0
  let skipped = 0

  for (const connection of connections) {
    for (const definition of INTEGRATION_SYNC_STREAMS) {
      if (!service.supportsCapability(connection.provider_id, definition.capability)) {
        continue
      }

      const [latest] = (await service.listIntegrationSyncRuns(
        {
          seller_id: connection.seller_id,
          provider_id: connection.provider_id,
          stream: definition.stream,
        },
        { order: { started_at: "DESC" }, take: 1 }
      )) as IntegrationSyncRunRow[]

      if (!isStreamDue(definition, latest ?? null, now)) {
        skipped++
        continue
      }

      try {
        await definition.run(container, {
          seller_id: connection.seller_id,
          provider_id: connection.provider_id,
          trigger: IntegrationSyncTrigger.SCHEDULE,
        })
        ran++
      } catch (e) {
        logger.error(
          `Integration sync "${definition.stream}" failed for store ${connection.seller_id} / ${connection.provider_id}: ${
            e instanceof Error ? e.message : String(e)
          }`
        )
      }
    }
  }

  return { ran, skipped }
}
