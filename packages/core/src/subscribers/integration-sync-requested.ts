import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  IntegrationSyncRunStatus,
  IntegrationSyncTrigger,
  MercurModules,
} from "@mercurjs/types"

import type IntegrationModuleService from "../modules/integration/service"
import { IntegrationWorkflowEvents } from "../workflows/events"
import { findSyncStream } from "../workflows/integration"

type SyncRequestedPayload = {
  seller_id: string
  provider_id: string
  stream: string
  run_id: string
}

/**
 * Executes a background sync run created by POST /vendor/integrations/:id/sync,
 * then any streams the definition chains after a successful manual run (items
 * → prices → stock). Each chained stream gets its own run. Failures are
 * recorded on runs.
 */
export default async function integrationSyncRequestedHandler({
  event,
  container,
}: SubscriberArgs<SyncRequestedPayload>) {
  const { seller_id, provider_id, stream, run_id } = event.data
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve<IntegrationModuleService>(MercurModules.INTEGRATION)

  const definition = findSyncStream(stream)
  if (!definition) {
    logger.warn(`Ignoring sync request for unknown stream "${stream}".`)
    return
  }

  const run = async (name: string, runId?: string) => {
    const next = findSyncStream(name)
    if (!next || !service.supportsCapability(provider_id, next.capability)) {
      return
    }
    try {
      await next.run(container, {
        seller_id,
        provider_id,
        trigger: IntegrationSyncTrigger.MANUAL,
        run_id: runId,
      })
    } catch (e) {
      logger.error(
        `Integration sync "${name}" failed for store ${seller_id} / ${provider_id}: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
    }
  }

  await run(stream, run_id)

  // Prices resolve items by sku, so don't chain after a failed items pull.
  const [first] = (await service.listIntegrationSyncRuns({ id: run_id })) as {
    status: string
  }[]
  if (first?.status !== IntegrationSyncRunStatus.SUCCESS) {
    return
  }
  for (const chained of definition.manual_then ?? []) {
    await run(chained)
  }
}

export const config: SubscriberConfig = {
  event: IntegrationWorkflowEvents.SYNC_REQUESTED,
  context: { subscriberId: "integration-sync-requested" },
}
