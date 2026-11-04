import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261103010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "integration_external_item_location" add column if not exists "synced_stock" integer null, add column if not exists "synced_stock_location_id" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "integration_external_item_location" drop column if exists "synced_stock", drop column if exists "synced_stock_location_id";`
    )
  }
}
