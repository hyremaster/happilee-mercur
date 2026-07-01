import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260622120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "store_profile" ("id" text not null, "seller_id" text not null, "industry" text check ("industry" in ('restaurant', 'grocery', 'fashion', 'electronics', 'beauty', 'bakery', 'pharmacy', 'other')) null, "commerce_type" text check ("commerce_type" in ('local_delivery', 'ecommerce_shipping')) null, "fulfillment_methods" jsonb null, "storefront_template" text check ("storefront_template" in ('classic', 'modern_minimal', 'bold_showcase')) null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "store_profile_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_profile_seller_id_unique" ON "store_profile" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_profile_deleted_at" ON "store_profile" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "store_order_status" ("id" text not null, "status" text check ("status" in ('order_placed', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled')) not null, "display_name" text not null, "color" text null, "is_active" boolean not null default false, "is_required" boolean not null default false, "rank" integer not null default 0, "metadata" jsonb null, "store_profile_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "store_order_status_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_order_status_profile_status_unique" ON "store_order_status" ("store_profile_id", "status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_order_status_store_profile_id" ON "store_order_status" ("store_profile_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_order_status_deleted_at" ON "store_order_status" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`alter table if exists "store_order_status" add constraint "store_order_status_store_profile_id_foreign" foreign key ("store_profile_id") references "store_profile" ("id") on update cascade on delete cascade;`);

    this.addSql(`create table if not exists "store_payment_config" ("id" text not null, "online_enabled" boolean not null default false, "payment_provider_id" text null, "cod_enabled" boolean not null default false, "cod_min_amount" numeric null, "raw_cod_min_amount" jsonb null, "cod_max_amount" numeric null, "raw_cod_max_amount" jsonb null, "currency_code" text null, "metadata" jsonb null, "store_profile_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "store_payment_config_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_payment_config_store_profile_id_unique" ON "store_payment_config" ("store_profile_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_payment_config_deleted_at" ON "store_payment_config" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`alter table if exists "store_payment_config" add constraint "store_payment_config_store_profile_id_foreign" foreign key ("store_profile_id") references "store_profile" ("id") on update cascade on delete cascade;`);

    this.addSql(`create table if not exists "store_location_detail" ("id" text not null, "stock_location_id" text not null, "is_active" boolean not null default true, "latitude" real null, "longitude" real null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "store_location_detail_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_location_detail_stock_location_id_unique" ON "store_location_detail" ("stock_location_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_location_detail_deleted_at" ON "store_location_detail" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "member_profile" ("id" text not null, "member_id" text not null, "handle" text not null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "member_profile_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_member_profile_member_id_unique" ON "member_profile" ("member_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_member_profile_handle_unique" ON "member_profile" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_member_profile_deleted_at" ON "member_profile" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "store_order_status" drop constraint if exists "store_order_status_store_profile_id_foreign";`);
    this.addSql(`alter table if exists "store_payment_config" drop constraint if exists "store_payment_config_store_profile_id_foreign";`);
    this.addSql(`drop table if exists "store_order_status" cascade;`);
    this.addSql(`drop table if exists "store_payment_config" cascade;`);
    this.addSql(`drop table if exists "store_location_detail" cascade;`);
    this.addSql(`drop table if exists "store_profile" cascade;`);
    this.addSql(`drop table if exists "member_profile" cascade;`);
  }
}
