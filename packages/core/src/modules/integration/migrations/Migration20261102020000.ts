import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261102020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "store_integration" add column if not exists "eligibility_rule" jsonb null;`
    )
    this.addSql(
      `alter table if exists "integration_external_item" add column if not exists "is_eligible" boolean not null default false, add column if not exists "eligibility_reason" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "store_integration" drop column if exists "eligibility_rule";`)
    this.addSql(
      `alter table if exists "integration_external_item" drop column if exists "is_eligible", drop column if exists "eligibility_reason";`
    )
  }
}
