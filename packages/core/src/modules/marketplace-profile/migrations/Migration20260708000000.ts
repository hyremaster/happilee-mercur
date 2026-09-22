import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260708000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "store_profile" add column if not exists "happilee_api_key" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "store_profile" drop column if exists "happilee_api_key";`
    )
  }
}
