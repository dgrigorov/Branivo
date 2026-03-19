import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDomainVerificationStatus1710000008000 implements MigrationInterface {
  name = 'AddDomainVerificationStatus1710000008000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Add verification status columns to tenant_domains
    // Existing rows (slug.branivo.bg subdomains) default to 'active' — correct
    await queryRunner.query(`
      ALTER TABLE "tenant_domains"
        ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'active'
          CHECK ("status" IN ('pending', 'verifying', 'active', 'failed')),
        ADD COLUMN IF NOT EXISTS "verification_token" VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "failure_reason" VARCHAR(512) NULL,
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

    // Unique index on verification_token for fast cron job lookup
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_domains_verification_token"
        ON "tenant_domains" ("verification_token")
        WHERE "verification_token" IS NOT NULL
    `);

    // Partial index for cron job polling (only pending/verifying rows)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tenant_domains_status_pending"
        ON "tenant_domains" ("status")
        WHERE "status" IN ('pending', 'verifying')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_tenant_domains_status_pending"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_tenant_domains_verification_token"`,
    );
    await queryRunner.query(`
      ALTER TABLE "tenant_domains"
        DROP COLUMN IF EXISTS "updated_at",
        DROP COLUMN IF EXISTS "failure_reason",
        DROP COLUMN IF EXISTS "verified_at",
        DROP COLUMN IF EXISTS "verification_token",
        DROP COLUMN IF EXISTS "status"
    `);
  }
}
