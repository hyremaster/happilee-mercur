import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261016000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "store_integration" ("id" text not null, "seller_id" text not null, "provider_id" text not null, "label" text null, "is_enabled" boolean not null default true, "credentials" text null, "settings" jsonb null, "status" text check ("status" in ('untested', 'connected', 'error')) not null default 'untested', "last_checked_at" timestamptz null, "last_error" text null, "updated_by" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "store_integration_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_integration_seller_provider_unique" ON "store_integration" ("seller_id", "provider_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_store_integration_seller_id" ON "store_integration" ("seller_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_store_integration_deleted_at" ON "store_integration" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "store_integration" cascade;`)
  }
}
