import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261102030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "integration_external_item" add column if not exists "product_id" text null, add column if not exists "variant_id" text null, add column if not exists "projection_error" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "integration_external_item" drop column if exists "product_id", drop column if exists "variant_id", drop column if exists "projection_error";`
    )
  }
}
