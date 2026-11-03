import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261103000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "integration_external_item" add column if not exists "synced_prices" jsonb null, add column if not exists "price_hold_reason" text null;`
    )
    this.addSql(
      `alter table if exists "store_integration" add column if not exists "price_list_id" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "integration_external_item" drop column if exists "synced_prices", drop column if exists "price_hold_reason";`
    )
    this.addSql(`alter table if exists "store_integration" drop column if exists "price_list_id";`)
  }
}
