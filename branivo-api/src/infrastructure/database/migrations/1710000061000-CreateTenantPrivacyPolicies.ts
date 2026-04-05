import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantPrivacyPolicies1710000061000 implements MigrationInterface {
  name = 'CreateTenantPrivacyPolicies1710000061000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_privacy_policies" (
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

        CONSTRAINT "PK_tenant_privacy_policies" PRIMARY KEY ("id"),
        CONSTRAINT "FK_privacy_policies_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_privacy_policies_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "uq_privacy_policy_tenant_version_lang"
          UNIQUE ("tenant_id", "version", "language")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_privacy_policies_public_lookup"
        ON "tenant_privacy_policies" ("tenant_id", "language", "is_published", "version" DESC)
    `);

    await queryRunner.query(
      `ALTER TABLE "tenant_privacy_policies" ENABLE ROW LEVEL SECURITY`,
    );

    await queryRunner.query(`
      CREATE POLICY "privacy_policies_tenant_isolation"
        ON "tenant_privacy_policies"
        USING (
          tenant_id::text = current_setting('app.current_tenant_id', true)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "privacy_policies_tenant_isolation" ON "tenant_privacy_policies"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_privacy_policies_public_lookup"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_privacy_policies"`);
  }
}
