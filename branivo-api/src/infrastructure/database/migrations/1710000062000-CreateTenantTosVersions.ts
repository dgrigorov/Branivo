import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantTosVersions1710000062000 implements MigrationInterface {
  name = 'CreateTenantTosVersions1710000062000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_tos_versions" (
        "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"    UUID         NOT NULL,
        "version"      INTEGER      NOT NULL,
        "content"      TEXT         NOT NULL,
        "language"     VARCHAR(5)   NOT NULL DEFAULT 'bg',
        "is_published" BOOLEAN      NOT NULL DEFAULT false,
        "published_at" TIMESTAMPTZ  NULL,
        "created_by"   UUID         NULL,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "deleted_at"   TIMESTAMPTZ  NULL,

        CONSTRAINT "PK_tenant_tos_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tos_versions_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tos_versions_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "uq_tos_version_tenant_version_lang"
          UNIQUE ("tenant_id", "version", "language")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_tos_versions_public_lookup"
        ON "tenant_tos_versions" ("tenant_id", "language", "is_published", "version" DESC)
    `);

    await queryRunner.query(
      `ALTER TABLE "tenant_tos_versions" ENABLE ROW LEVEL SECURITY`,
    );

    await queryRunner.query(`
      CREATE POLICY "tos_versions_tenant_isolation"
        ON "tenant_tos_versions"
        USING (
          tenant_id::text = current_setting('app.current_tenant_id', true)
        )
    `);

    await queryRunner.query(`
      CREATE TABLE "end_client_tos_acceptances" (
        "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
        "client_id"      UUID         NOT NULL,
        "tenant_id"      UUID         NOT NULL,
        "tos_version_id" UUID         NOT NULL,
        "accepted_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "ip_address"     VARCHAR(45)  NULL,
        "user_agent"     TEXT         NULL,

        CONSTRAINT "PK_end_client_tos_acceptances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tos_acceptances_client"
          FOREIGN KEY ("client_id") REFERENCES "end_clients" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tos_acceptances_version"
          FOREIGN KEY ("tos_version_id") REFERENCES "tenant_tos_versions" ("id"),
        CONSTRAINT "uq_tos_acceptance_client_version"
          UNIQUE ("client_id", "tos_version_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_tos_acceptances_client_tenant"
        ON "end_client_tos_acceptances" ("client_id", "tenant_id")
    `);

    await queryRunner.query(
      `ALTER TABLE "end_client_tos_acceptances" ENABLE ROW LEVEL SECURITY`,
    );

    await queryRunner.query(`
      CREATE POLICY "tos_acceptances_tenant_isolation"
        ON "end_client_tos_acceptances"
        USING (
          tenant_id::text = current_setting('app.current_tenant_id', true)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tos_acceptances_tenant_isolation" ON "end_client_tos_acceptances"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "end_client_tos_acceptances"`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tos_versions_tenant_isolation" ON "tenant_tos_versions"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_tos_versions_public_lookup"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_tos_versions"`);
  }
}
