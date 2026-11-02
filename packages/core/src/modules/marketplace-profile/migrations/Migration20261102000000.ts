import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261102000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "order_extension" add column if not exists "fulfilment_location_id" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "order_extension" drop column if exists "fulfilment_location_id";`
    )
  }
}
