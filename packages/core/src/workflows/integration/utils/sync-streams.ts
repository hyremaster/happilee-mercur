import { MedusaContainer } from "@medusajs/framework/types"
import {
  IntegrationCapability,
  IntegrationSyncStream,
  IntegrationSyncTrigger,
} from "@mercurjs/types"

import { syncIntegrationLocationsWorkflow } from "../workflows"

export type IntegrationSyncStreamRunInput = {
  seller_id: string
  provider_id: string
  trigger: IntegrationSyncTrigger
}

/**
 * A sync stream the scheduled dispatcher runs for every store connection
 * whose provider has `capability`. Later streams (items, prices, stock,
 * orders) are added here with their own interval.
 */
export type IntegrationSyncStreamDefinition = {
  stream: IntegrationSyncStream
  capability: IntegrationCapability
  /** Run when the latest successful run is older than this. */
  interval_minutes: number
  /** After a failed run, retry sooner than the interval. */
  retry_after_failure_minutes: number
  run: (container: MedusaContainer, input: IntegrationSyncStreamRunInput) => Promise<void>
}

export const INTEGRATION_SYNC_STREAMS: IntegrationSyncStreamDefinition[] = [
  {
    stream: IntegrationSyncStream.LOCATIONS,
    capability: IntegrationCapability.LOCATIONS,
    interval_minutes: 24 * 60,
    retry_after_failure_minutes: 60,
    run: async (container, input) => {
      await syncIntegrationLocationsWorkflow(container).run({ input })
    },
  },
]
