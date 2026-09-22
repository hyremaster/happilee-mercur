import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260708020000 extends Migration {
  override async up(): Promise<void> {
    // Add `label` to distinguish multiple accounts of the same gateway type.
    this.addSql(`alter table "store_payment_gateway" add column if not exists "label" text;`)
    this.addSql(`update "store_payment_gateway" set "label" = 'default' where "label" is null;`)
    this.addSql(`alter table "store_payment_gateway" alter column "label" set not null;`)

    // Row identity is now `id`; drop the (seller_id, gateway) uniqueness.
    this.addSql(`DROP INDEX IF EXISTS "IDX_store_payment_gateway_seller_gateway_unique";`)

    // No duplicate labels for the same gateway type within a store.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_payment_gateway_seller_gateway_label_unique" ON "store_payment_gateway" ("seller_id", "gateway", "label") WHERE deleted_at IS NULL;`)

    // At most one active account per gateway type per store.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_payment_gateway_seller_gateway_active_unique" ON "store_payment_gateway" ("seller_id", "gateway") WHERE is_active = true AND deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_store_payment_gateway_seller_gateway_active_unique";`)
    this.addSql(`DROP INDEX IF EXISTS "IDX_store_payment_gateway_seller_gateway_label_unique";`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_payment_gateway_seller_gateway_unique" ON "store_payment_gateway" ("seller_id", "gateway") WHERE deleted_at IS NULL;`)
    this.addSql(`alter table "store_payment_gateway" drop column if exists "label";`)
  }
}
