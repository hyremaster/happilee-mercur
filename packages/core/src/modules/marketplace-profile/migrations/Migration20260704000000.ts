import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260704000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "store_order_status_event" (
        "id" text not null,
        "order_id" text not null,
        "seller_id" text not null,
        "status" text check ("status" in ('order_placed', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled')) not null,
        "changed_by" text null,
        "note" text null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "store_order_status_event_pkey" primary key ("id")
      );
    `)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_order_status_event_order_id" ON "store_order_status_event" ("order_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_order_status_event_seller_id" ON "store_order_status_event" ("seller_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_order_status_event_deleted_at" ON "store_order_status_event" ("deleted_at") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "store_order_status_event" cascade;`)
  }
}
