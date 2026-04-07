import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds SHA-256 hash chain columns to audit_log for tamper-evidence.
 * KFN audit requirement: every record is cryptographically chained to the previous one.
 * Pre-existing records keep NULL in both columns (pre-chain entries).
 */
export class AddHashChainToAuditLog1710000064000 implements MigrationInterface {
  name = 'AddHashChainToAuditLog1710000064000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1.2 — SHA-256 hash of the previous entry for this tenant
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "prev_hash" VARCHAR(64) NULL`,
    );

    // 1.3 — SHA-256 hash of the current entry (includes prev_hash)
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "entry_hash" VARCHAR(64) NULL`,
    );

    // 1.4 — Index for efficient chain traversal per tenant
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_chain_lookup"
       ON "audit_log"("tenant_id", "created_at" DESC, "id" DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // 1.5 — Reverse migration
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_log_chain_lookup"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "entry_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "prev_hash"`,
    );
  }
}
