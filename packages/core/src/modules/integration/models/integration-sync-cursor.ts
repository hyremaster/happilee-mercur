import { model } from "@medusajs/framework/utils"

/**
 * Delta cursor per store × provider × stream. Advanced only after a
 * successful run, so a failed run is retried from the previous cursor.
 */
const IntegrationSyncCursor = model
  .define("IntegrationSyncCursor", {
    id: model.id({ prefix: "intcur" }).primaryKey(),
    seller_id: model.text(),
    provider_id: model.text(),
    stream: model.text(),
    cursor: model.text().nullable(),
    last_full_at: model.dateTime().nullable(),
    last_success_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_integration_sync_cursor_unique",
      on: ["seller_id", "provider_id", "stream"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default IntegrationSyncCursor
