import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261026000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "integration_external_item" ("id" text not null, "seller_id" text not null, "provider_id" text not null, "external_id" text not null, "name" text not null, "sku" text null, "barcode" text null, "status" text null, "is_active" boolean not null default true, "manufacturer" text null, "tax_rate" real null, "hsn_code" text null, "attributes" jsonb null, "raw" jsonb null, "raw_hash" text not null, "projection_pending" boolean not null default true, "last_seen_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "integration_external_item_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_integration_external_item_unique" ON "integration_external_item" ("seller_id", "provider_id", "external_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_external_item_sku" ON "integration_external_item" ("seller_id", "provider_id", "sku") WHERE deleted_at IS NULL AND sku IS NOT NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_external_item_pending" ON "integration_external_item" ("seller_id", "provider_id") WHERE deleted_at IS NULL AND projection_pending = true;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_external_item_deleted_at" ON "integration_external_item" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "integration_external_item_location" ("id" text not null, "seller_id" text not null, "provider_id" text not null, "item_external_id" text not null, "location_external_id" text not null, "sku" text null, "is_online" boolean null, "buffer_qty" real null, "sale_price" numeric null, "special_price" numeric null, "mrp" numeric null, "original_price" numeric null, "tax_rate" real null, "attributes" jsonb null, "raw" jsonb null, "raw_hash" text null, "price_raw" jsonb null, "price_hash" text null, "item_changed_at" timestamptz null, "price_changed_at" timestamptz null, "raw_sale_price" jsonb null, "raw_special_price" jsonb null, "raw_mrp" jsonb null, "raw_original_price" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "integration_external_item_location_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_integration_external_item_location_unique" ON "integration_external_item_location" ("seller_id", "provider_id", "item_external_id", "location_external_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_external_item_location_deleted_at" ON "integration_external_item_location" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "integration_external_stock" ("id" text not null, "seller_id" text not null, "provider_id" text not null, "item_external_id" text not null, "location_external_id" text not null, "lot_key" text not null, "quantity" real not null default 0, "mrp" numeric null, "raw" jsonb null, "raw_hash" text not null, "seen_at" timestamptz not null, "raw_mrp" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "integration_external_stock_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_integration_external_stock_unique" ON "integration_external_stock" ("seller_id", "provider_id", "item_external_id", "location_external_id", "lot_key") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_external_stock_deleted_at" ON "integration_external_stock" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "integration_sync_cursor" ("id" text not null, "seller_id" text not null, "provider_id" text not null, "stream" text not null, "cursor" text null, "last_full_at" timestamptz null, "last_success_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "integration_sync_cursor_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_integration_sync_cursor_unique" ON "integration_sync_cursor" ("seller_id", "provider_id", "stream") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_integration_sync_cursor_deleted_at" ON "integration_sync_cursor" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "integration_sync_cursor" cascade;`)
    this.addSql(`drop table if exists "integration_external_stock" cascade;`)
    this.addSql(`drop table if exists "integration_external_item_location" cascade;`)
    this.addSql(`drop table if exists "integration_external_item" cascade;`)
  }
}
