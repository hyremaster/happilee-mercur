import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260701100000 extends Migration {
  override async up(): Promise<void> {
    // Drop the hardcoded CHECK constraint so any template key from the new table is accepted
    this.addSql(`ALTER TABLE "store_profile" DROP CONSTRAINT IF EXISTS "store_profile_storefront_template_check";`)

    this.addSql(`create table if not exists "storefront_template" ("id" text not null, "name" text not null, "key" text not null, "description" text null, "preview_image_url" text null, "is_active" boolean not null default true, "rank" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "storefront_template_pkey" primary key ("id"));`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_storefront_template_key_unique" ON "storefront_template" ("key") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_storefront_template_deleted_at" ON "storefront_template" ("deleted_at") WHERE deleted_at IS NULL;`)

    this.addSql(`INSERT INTO "storefront_template" ("id", "name", "key", "rank") VALUES ('sftempl_classic', 'Classic', 'classic', 0), ('sftempl_modern_minimal', 'Modern Minimal', 'modern_minimal', 1), ('sftempl_bold_showcase', 'Bold Showcase', 'bold_showcase', 2) ON CONFLICT DO NOTHING;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "storefront_template" cascade;`)
    this.addSql(`ALTER TABLE "store_profile" ADD CONSTRAINT "store_profile_storefront_template_check" CHECK ("storefront_template" IN ('classic', 'modern_minimal', 'bold_showcase'));`)
  }
}
