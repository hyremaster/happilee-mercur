import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260929000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "store_product_handle" ("id" text not null, "product_id" text not null, "seller_id" text not null, "handle" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "store_product_handle_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_product_handle_product_id_unique" ON "store_product_handle" ("product_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_product_handle_seller_handle_unique" ON "store_product_handle" ("seller_id", "handle") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_store_product_handle_deleted_at" ON "store_product_handle" ("deleted_at") WHERE deleted_at IS NULL;`
    )

    // Existing seller products keep the handle they already have (globally
    // unique, so unique per store too). Skipped on a fresh database, where the
    // product-seller link table does not exist yet.
    this.addSql(`
      DO $$
      BEGIN
        IF to_regclass('public.product_product_seller_seller') IS NOT NULL
           AND to_regclass('public.product') IS NOT NULL THEN
          INSERT INTO "store_product_handle" ("id", "product_id", "seller_id", "handle")
          SELECT 'sprodh_' || replace(gen_random_uuid()::text, '-', ''), p.id, l.seller_id, p.handle
          FROM "product" p
          JOIN "product_product_seller_seller" l
            ON l.product_id = p.id AND l.deleted_at IS NULL
          WHERE p.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM "store_product_handle" s
              WHERE s.product_id = p.id AND s.deleted_at IS NULL
            );
        END IF;
      END $$;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "store_product_handle" cascade;`)
  }
}
