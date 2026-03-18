import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1710000002000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID        NOT NULL,
        email           VARCHAR(255) NOT NULL,
        password_hash   VARCHAR(255) NOT NULL,
        role            VARCHAR(50)  NOT NULL DEFAULT 'broker_agent',
        two_fa_enabled  BOOLEAN     NOT NULL DEFAULT false,
        two_fa_secret_enc TEXT       NULL,
        failed_login_count INT       NOT NULL DEFAULT 0,
        locked_until    TIMESTAMPTZ NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ NULL
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_tenant_id ON users(tenant_id, email) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id)`,
    );

    // Enable RLS
    await queryRunner.query(`ALTER TABLE users ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE users FORCE ROW LEVEL SECURITY`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'tenant_isolation_users'
        ) THEN
          CREATE POLICY tenant_isolation_users ON users
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
        END IF;
      END $$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
