import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260708010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "store_onboarding_draft" add column if not exists "happilee_api_key" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "store_onboarding_draft" drop column if exists "happilee_api_key";`
    )
  }
}
