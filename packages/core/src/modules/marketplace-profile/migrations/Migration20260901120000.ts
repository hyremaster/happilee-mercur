import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260901120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "phone_otp" ("id" text not null, "phone" text not null, "code_hash" text not null, "expires_at" timestamptz not null, "attempts" integer not null default 0, "consumed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "phone_otp_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_phone_otp_phone" ON "phone_otp" ("phone") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "phone_otp" cascade;`)
  }
}
