import { MedusaContainer } from "@medusajs/framework/types"

import { runDueIntegrationSyncs } from "../workflows/integration/utils/run-due-integration-syncs"

/**
 * Runs store integration sync streams that are due (see
 * INTEGRATION_SYNC_STREAMS for each stream's interval). Ticks every 15 minutes;
 * a stream only runs when its interval has passed. Set
 * INTEGRATION_SYNC_SCHEDULE_ENABLED=false to turn scheduled syncs off.
 */
export default async function integrationSyncDispatcher(container: MedusaContainer) {
  if (process.env.INTEGRATION_SYNC_SCHEDULE_ENABLED === "false") {
    return
  }
  await runDueIntegrationSyncs(container)
}

export const config = {
  name: "integration-sync-dispatcher",
  schedule: "*/15 * * * *",
}
