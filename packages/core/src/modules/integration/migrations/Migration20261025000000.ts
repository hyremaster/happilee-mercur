import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261025000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "integration_location" ("id" text not null, "seller_id" text not null, "provider_id" text not null, "external_id" text not null, "name" text not null, "code" text null, "address" text null, "city" text null, "status" text check ("status" in ('active', 'inactive')) not null default 'active', "stock_location_id" text null, "last_seen_at" timestamptz null, "raw" jsonb null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "integration_location_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_integration_location_external_unique" ON "integration_location" ("seller_id", "provider_id", "external_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_integration_location_stock_location_unique" ON "integration_location" ("seller_id", "provider_id", "stock_location_id") WHERE deleted_at IS NULL AND stock_location_id IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_location_seller_provider" ON "integration_location" ("seller_id", "provider_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_location_deleted_at" ON "integration_location" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "integration_sync_run" ("id" text not null, "seller_id" text not null, "provider_id" text not null, "stream" text not null, "trigger" text check ("trigger" in ('manual', 'schedule', 'connect')) not null, "status" text check ("status" in ('running', 'success', 'failed')) not null default 'running', "counts" jsonb null, "error" text null, "started_at" timestamptz not null, "finished_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "integration_sync_run_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_sync_run_lookup" ON "integration_sync_run" ("seller_id", "provider_id", "stream", "started_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_sync_run_deleted_at" ON "integration_sync_run" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "integration_sync_run" cascade;`)
    this.addSql(`drop table if exists "integration_location" cascade;`)
  }
}
