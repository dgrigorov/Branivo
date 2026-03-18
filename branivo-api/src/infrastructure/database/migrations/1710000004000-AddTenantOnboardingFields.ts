import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds onboarding-specific fields to the tenants table.
 * Checks for existence before adding to be safe with existing data.
 * Note: slug and status already exist from CreateTenantsTable migration.
 * This adds: stripe_account_id, kfn_license, and indexes.
 */
export class AddTenantOnboardingFields1710000004000 implements MigrationInterface {
  name = 'AddTenantOnboardingFields1710000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Add stripe_account_id if it doesn't exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tenants' AND column_name = 'stripe_account_id'
        ) THEN
          ALTER TABLE "tenants" ADD COLUMN "stripe_account_id" VARCHAR(255) NULL;
        END IF;
      END;
      $$
    `);

    // Add kfn_license if it doesn't exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tenants' AND column_name = 'kfn_license'
        ) THEN
          ALTER TABLE "tenants" ADD COLUMN "kfn_license" VARCHAR(100) NULL;
        END IF;
      END;
      $$
    `);

    // Indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tenants_slug" ON "tenants"("slug")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tenants_status" ON "tenants"("status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tenants_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tenants_slug"`);
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "kfn_license"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "stripe_account_id"`,
    );
  }
}
