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

/** True when a "running" run started longer ago than the stream allows (crashed). */
export function isRunStale(
  definition: Pick<IntegrationSyncStreamDefinition, "stale_after_minutes">,
  run: Pick<IntegrationSyncRunRow, "status" | "started_at">,
  now: Date = new Date()
): boolean {
  return (
    run.status === IntegrationSyncRunStatus.RUNNING &&
    now.getTime() - new Date(run.started_at).getTime() >=
      definition.stale_after_minutes * MINUTE
  )
}

/**
 * Scheduled syncs call live external systems, so they run only where that is
 * intended: INTEGRATION_SYNC_SCHEDULE_ENABLED=true, or production when it is
 * unset. Any other value means off, so a typo can't start them.
 */
export function isIntegrationSyncScheduleEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const value = env.INTEGRATION_SYNC_SCHEDULE_ENABLED?.trim().toLowerCase()
  return value ? value === "true" : env.NODE_ENV === "production"
}

/**
 * Mark runs the server abandoned (restart or crash) as failed. Nothing else
 * closes them, and the panel keeps polling while a run says it is running.
 */
export async function closeAbandonedIntegrationSyncRuns(
  container: MedusaContainer,
  now: Date = new Date()
): Promise<void> {
  const service = container.resolve<IntegrationModuleService>(MercurModules.INTEGRATION)

  const running = (await service.listIntegrationSyncRuns(
    { status: IntegrationSyncRunStatus.RUNNING },
    { take: null }
  )) as IntegrationSyncRunRow[]

  for (const run of running) {
    const definition = INTEGRATION_SYNC_STREAMS.find((d) => d.stream === run.stream)
    if (definition && isRunStale(definition, run, now)) {
      await service.updateIntegrationSyncRuns({
        id: run.id,
        status: IntegrationSyncRunStatus.FAILED,
        error: "The sync stopped before finishing (server restart or crash).",
        finished_at: now,
      })
    }
  }
}

/**
 * One tick of the sync dispatcher job. Abandoned runs are closed either way,
 * because that touches only our own tables; due syncs start only when the
 * schedule is enabled.
 */
export async function runScheduledIntegrationSyncs(
  container: MedusaContainer,
  options: { now?: Date; env?: Record<string, string | undefined> } = {}
): Promise<void> {
  const now = options.now ?? new Date()

  await closeAbandonedIntegrationSyncRuns(container, now)

  if (isIntegrationSyncScheduleEnabled(options.env)) {
    await runDueIntegrationSyncs(container, now)
  }
}

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
    return isRunStale(definition, latest, now)
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

  await closeAbandonedIntegrationSyncRuns(container, now)

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

      if (definition.scheduled_after_success_of) {
        const [succeeded] = (await service.listIntegrationSyncRuns(
          {
            seller_id: connection.seller_id,
            provider_id: connection.provider_id,
            stream: definition.scheduled_after_success_of,
            status: IntegrationSyncRunStatus.SUCCESS,
          },
          { take: 1 }
        )) as IntegrationSyncRunRow[]
        if (!succeeded) {
          skipped++
          continue
        }
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
