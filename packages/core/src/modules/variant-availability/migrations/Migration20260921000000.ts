import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260921000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "variant_availability" ("id" text not null, "is_available" boolean not null default true, "unavailable_until" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "variant_availability_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_variant_availability_deleted_at" ON "variant_availability" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "variant_availability" cascade;`)
  }
}
