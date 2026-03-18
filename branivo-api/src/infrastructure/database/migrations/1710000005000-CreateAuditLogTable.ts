import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * audit_log is IMMUTABLE — no UPDATE or DELETE endpoints ever.
 * RLS uses tenant_id scope; Super Admin entries use system tenant_id.
 */
export class CreateAuditLogTable1710000005000 implements MigrationInterface {
  name = 'CreateAuditLogTable1710000005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_log" (
        "id"          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "tenant_id"   UUID NOT NULL,
        "user_id"     UUID NULL,
        "action"      VARCHAR(100) NOT NULL,
        "entity_type" VARCHAR(100) NULL,
        "entity_id"   UUID NULL,
        "metadata"    JSONB NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_tenant_id" ON "audit_log"("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_action" ON "audit_log"("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_log_entity" ON "audit_log"("entity_type", "entity_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'audit_log' AND policyname = 'tenant_isolation_audit_log'
        ) THEN
          CREATE POLICY tenant_isolation_audit_log ON "audit_log"
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
        END IF;
      END $$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`);
  }
}
