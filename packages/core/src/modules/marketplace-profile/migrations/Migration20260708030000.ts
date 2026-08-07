import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260708030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "happilee_identity_key" ("id" text not null, "auth_identity_id" text not null, "project_id" text null, "happilee_api_key" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "happilee_identity_key_pkey" primary key ("id"));`
    )
    this.addSql(
      `create unique index if not exists "IDX_happilee_identity_key_auth_identity_id" on "happilee_identity_key" ("auth_identity_id") where "deleted_at" is null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "happilee_identity_key" cascade;`)
  }
}
