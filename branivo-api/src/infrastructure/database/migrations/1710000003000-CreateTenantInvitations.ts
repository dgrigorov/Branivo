import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantInvitations1710000003000 implements MigrationInterface {
  name = 'CreateTenantInvitations1710000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_invitations" (
        "id"          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "tenant_id"   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "email"       VARCHAR(255) NOT NULL,
        "token"       VARCHAR(512) NOT NULL UNIQUE,
        "status"      VARCHAR(50) NOT NULL DEFAULT 'pending',
        "expires_at"  TIMESTAMPTZ NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"  TIMESTAMPTZ NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_tenant_invitations_token" ON "tenant_invitations"("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tenant_invitations_tenant_id" ON "tenant_invitations"("tenant_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_tenant_invitations_tenant_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_tenant_invitations_token"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_invitations"`);
  }
}
