import { MedusaContainer } from "@medusajs/framework/types"

import { runScheduledIntegrationSyncs } from "../workflows/integration/utils/run-due-integration-syncs"

/**
 * Runs store integration sync streams that are due (see
 * INTEGRATION_SYNC_STREAMS for each stream's interval). Ticks every 15 minutes;
 * a stream only runs when its interval has passed. Scheduled syncs are on in
 * production and off elsewhere; set INTEGRATION_SYNC_SCHEDULE_ENABLED to
 * override (see isIntegrationSyncScheduleEnabled).
 */
export default async function integrationSyncDispatcher(container: MedusaContainer) {
  await runScheduledIntegrationSyncs(container)
}

export const config = {
  name: "integration-sync-dispatcher",
  schedule: "*/15 * * * *",
}
