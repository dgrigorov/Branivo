import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RLS policies for all tables with tenant_id.
 * Applied conditionally (IF EXISTS) so this migration is safe to run
 * before or after domain table migrations — domain migrations will
 * apply RLS inline for any new tables added after this point.
 */
const TABLES_WITH_RLS = [
  'quotes',
  'policies',
  'policy_events',
  'payments',
  'vehicles',
  'customers',
  'audit_log',
  'notifications',
];

export class AddRlsPolicies1710000001000 implements MigrationInterface {
  name = 'AddRlsPolicies1710000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES_WITH_RLS) {
      // Apply RLS only if the table already exists (idempotent — safe to run
      // before domain migrations; domain migrations must re-apply RLS inline).
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT FROM pg_tables
            WHERE schemaname = 'public' AND tablename = '${table}'
          ) THEN
            ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
            ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;
            DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table}";
            CREATE POLICY "tenant_isolation_policy" ON "${table}"
              USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
          END IF;
        END;
        $$
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES_WITH_RLS) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT FROM pg_tables
            WHERE schemaname = 'public' AND tablename = '${table}'
          ) THEN
            DROP POLICY IF EXISTS "tenant_isolation_policy" ON "${table}";
            ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY;
          END IF;
        END;
        $$
      `);
    }
  }
}
