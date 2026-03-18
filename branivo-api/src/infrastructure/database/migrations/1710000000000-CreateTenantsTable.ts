import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantsTable1710000000000 implements MigrationInterface {
  name = 'CreateTenantsTable1710000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id"            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "slug"          VARCHAR(63) NOT NULL UNIQUE,
        "name"          VARCHAR(255) NOT NULL,
        "status"        VARCHAR(32) NOT NULL DEFAULT 'active',
        "plan"          VARCHAR(32) NOT NULL DEFAULT 'starter',
        "features"      JSONB NOT NULL DEFAULT '{}',
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"    TIMESTAMPTZ NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_configs" (
        "id"            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "tenant_id"     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "primary_color" VARCHAR(7) NOT NULL DEFAULT '#1A56DB',
        "logo_url"      VARCHAR(512) NULL,
        "support_email" VARCHAR(255) NULL,
        "support_phone" VARCHAR(32) NULL,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_domains" (
        "id"            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "tenant_id"     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "domain"        VARCHAR(255) NOT NULL UNIQUE,
        "is_primary"    BOOLEAN NOT NULL DEFAULT false,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_tenant_domains_domain" ON "tenant_domains"("domain")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tenant_domains_tenant_id" ON "tenant_domains"("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tenant_configs_tenant_id" ON "tenant_configs"("tenant_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_domains"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
  }
}
