import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260713120000 extends Migration {

  override async up(): Promise<void> {
    // A member (user) can own many sellers (Happilee projects), each carrying the
    // owner's email, so seller.email must not be globally unique. Drop the unique
    // index and replace it with a plain lookup index. Uniqueness stays on member.
    this.addSql(`drop index if exists "IDX_seller_email_unique";`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_email" ON "seller" ("email") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_seller_email";`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_email_unique" ON "seller" ("email") WHERE deleted_at IS NULL;`);
  }

}
