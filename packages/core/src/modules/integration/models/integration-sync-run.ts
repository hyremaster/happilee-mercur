import { model } from "@medusajs/framework/utils"
import { IntegrationSyncRunStatus, IntegrationSyncTrigger } from "@mercurjs/types"

/**
 * One execution of a sync stream (locations now; items, stock, orders later)
 * for one store and provider. `stream` is plain text so new streams need no
 * migration.
 */
const IntegrationSyncRun = model
  .define("IntegrationSyncRun", {
    id: model.id({ prefix: "intrun" }).primaryKey(),
    seller_id: model.text(),
    provider_id: model.text(),
    stream: model.text(),
    trigger: model.enum(IntegrationSyncTrigger),
    status: model
      .enum(IntegrationSyncRunStatus)
      .default(IntegrationSyncRunStatus.RUNNING),
    counts: model.json().nullable(),
    error: model.text().nullable(),
    started_at: model.dateTime(),
    finished_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_integration_sync_run_lookup",
      on: ["seller_id", "provider_id", "stream", "started_at"],
      where: "deleted_at IS NULL",
    },
  ])

export default IntegrationSyncRun
