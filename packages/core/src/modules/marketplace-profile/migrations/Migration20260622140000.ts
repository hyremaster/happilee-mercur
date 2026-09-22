import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260622140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "store_onboarding_draft" ("id" text not null, "auth_identity_id" text not null, "draft_data" jsonb null, "onboarding_step" integer not null default 0, "status" text check ("status" in ('draft', 'submitted')) not null default 'draft', "submitted_seller_id" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "store_onboarding_draft_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_onboarding_draft_auth_identity_id" ON "store_onboarding_draft" ("auth_identity_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_onboarding_draft_status" ON "store_onboarding_draft" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_onboarding_draft_deleted_at" ON "store_onboarding_draft" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "store_onboarding_draft" cascade;`);
  }
}
