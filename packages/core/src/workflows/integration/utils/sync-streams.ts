import { MedusaContainer } from "@medusajs/framework/types"
import {
  IntegrationCapability,
  IntegrationSyncStream,
  IntegrationSyncTrigger,
} from "@mercurjs/types"

import {
  syncIntegrationCatalogStreamWorkflow,
  syncIntegrationLocationsWorkflow,
} from "../workflows"

export type IntegrationSyncStreamRunInput = {
  seller_id: string
  provider_id: string
  trigger: IntegrationSyncTrigger
  /** A run already created by the API (manual background trigger). */
  run_id?: string
}

/**
 * A sync stream the scheduled dispatcher runs for every store connection
 * whose provider has `capability`. Later streams (orders) are added here with
 * their own interval.
 */
export type IntegrationSyncStreamDefinition = {
  stream: IntegrationSyncStream
  capability: IntegrationCapability
  /** Run when the latest successful run is older than this. */
  interval_minutes: number
  /** After a failed run, retry sooner than the interval. */
  retry_after_failure_minutes: number
  /**
   * A run still "running" after this long is treated as crashed: it no longer
   * blocks scheduled or manual runs.
   */
  stale_after_minutes: number
  /**
   * Scheduled runs wait until this stream has succeeded once (D-036: the
   * first full catalogue pull against a live ERP is started by a person).
   */
  scheduled_after_success_of?: IntegrationSyncStream
  /** Streams a manual run of this stream also runs afterwards, in order. */
  manual_then?: IntegrationSyncStream[]
  /** Runs inline in the API request (small) instead of in the background. */
  inline: boolean
  run: (container: MedusaContainer, input: IntegrationSyncStreamRunInput) => Promise<void>
}

const runCatalogStream =
  (stream: IntegrationSyncStream.ITEMS | IntegrationSyncStream.PRICES | IntegrationSyncStream.STOCK) =>
  async (container: MedusaContainer, input: IntegrationSyncStreamRunInput) => {
    await syncIntegrationCatalogStreamWorkflow(container).run({
      input: { ...input, stream },
    })
  }

/** Order matters: items run before prices, whose rows resolve items by sku. */
export const INTEGRATION_SYNC_STREAMS: IntegrationSyncStreamDefinition[] = [
  {
    stream: IntegrationSyncStream.LOCATIONS,
    capability: IntegrationCapability.LOCATIONS,
    interval_minutes: 24 * 60,
    retry_after_failure_minutes: 60,
    stale_after_minutes: 10,
    inline: true,
    run: async (container, input) => {
      await syncIntegrationLocationsWorkflow(container).run({ input })
    },
  },
  {
    stream: IntegrationSyncStream.ITEMS,
    capability: IntegrationCapability.CATALOG,
    interval_minutes: 15,
    retry_after_failure_minutes: 15,
    stale_after_minutes: 60,
    scheduled_after_success_of: IntegrationSyncStream.ITEMS,
    manual_then: [IntegrationSyncStream.PRICES, IntegrationSyncStream.STOCK],
    inline: false,
    run: runCatalogStream(IntegrationSyncStream.ITEMS),
  },
  {
    stream: IntegrationSyncStream.PRICES,
    capability: IntegrationCapability.PRICES,
    interval_minutes: 15,
    retry_after_failure_minutes: 15,
    stale_after_minutes: 60,
    scheduled_after_success_of: IntegrationSyncStream.ITEMS,
    inline: false,
    run: runCatalogStream(IntegrationSyncStream.PRICES),
  },
  {
    stream: IntegrationSyncStream.STOCK,
    capability: IntegrationCapability.STOCK,
    interval_minutes: 15,
    retry_after_failure_minutes: 15,
    stale_after_minutes: 60,
    scheduled_after_success_of: IntegrationSyncStream.ITEMS,
    inline: false,
    run: runCatalogStream(IntegrationSyncStream.STOCK),
  },
]

export const findSyncStream = (
  stream: string
): IntegrationSyncStreamDefinition | undefined =>
  INTEGRATION_SYNC_STREAMS.find((definition) => definition.stream === stream)
