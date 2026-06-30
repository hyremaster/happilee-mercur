import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Convert store_profile.fulfillment_methods from jsonb to a text[] column so it
 * maps to model.array() (a proper string array) instead of model.json(). The
 * column is only written during onboarding and is empty at this point, so a
 * drop + re-add is safe.
 */
export class Migration20260622130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "store_profile" drop column if exists "fulfillment_methods";`);
    this.addSql(`alter table if exists "store_profile" add column if not exists "fulfillment_methods" text[] null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "store_profile" drop column if exists "fulfillment_methods";`);
    this.addSql(`alter table if exists "store_profile" add column if not exists "fulfillment_methods" jsonb null;`);
  }
}
