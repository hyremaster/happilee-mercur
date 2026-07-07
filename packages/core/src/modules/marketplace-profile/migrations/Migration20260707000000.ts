import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260707000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "store_delivery_area" (
        "id" text not null,
        "seller_id" text not null,
        "area_sense_id" text not null,
        "area_name" text not null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "store_delivery_area_pkey" primary key ("id")
      );
    `)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_delivery_area_seller_area_unique" ON "store_delivery_area" ("seller_id", "area_sense_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_delivery_area_seller_id" ON "store_delivery_area" ("seller_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_delivery_area_deleted_at" ON "store_delivery_area" ("deleted_at") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "store_delivery_area" cascade;`)
  }
}
