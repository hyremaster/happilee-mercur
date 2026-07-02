import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260702000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "store_payment_gateway" (
        "id" text not null,
        "seller_id" text not null,
        "gateway" text check ("gateway" in ('razorpay')) not null,
        "is_active" boolean not null default false,
        "credentials" jsonb not null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "store_payment_gateway_pkey" primary key ("id")
      );
    `)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_payment_gateway_seller_gateway_unique" ON "store_payment_gateway" ("seller_id", "gateway") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_gateway_seller_id" ON "store_payment_gateway" ("seller_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_gateway_deleted_at" ON "store_payment_gateway" ("deleted_at") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "store_payment_gateway" cascade;`)
  }
}
