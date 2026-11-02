import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261102010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_external_item_location_sku" ON "integration_external_item_location" ("seller_id", "provider_id", "sku", "location_external_id") WHERE deleted_at IS NULL AND sku IS NOT NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_integration_external_item_location_sku";`)
  }
}
