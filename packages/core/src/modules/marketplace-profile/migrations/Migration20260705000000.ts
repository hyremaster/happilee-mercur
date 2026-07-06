import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260705000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "order_extension" (
        "id" text not null,
        "order_id" text not null,
        "seller_id" text not null,
        "current_status" text check ("current_status" in ('order_placed', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled')) not null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "order_extension_pkey" primary key ("id")
      );
    `)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_extension_order_id_unique" ON "order_extension" ("order_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_extension_seller_status" ON "order_extension" ("seller_id", "current_status") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_extension_deleted_at" ON "order_extension" ("deleted_at") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "order_extension" cascade;`)
  }
}
