import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCookiePoliciesAndConsents1710000063000 implements MigrationInterface {
  name = 'CreateCookiePoliciesAndConsents1710000063000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Task 1: tenant_cookie_policies table
    await queryRunner.query(`
      CREATE TABLE "tenant_cookie_policies" (
        "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"    UUID NOT NULL,
        "version"      INTEGER NOT NULL,
        "content"      TEXT NOT NULL,
        "language"     VARCHAR(5) NOT NULL DEFAULT 'bg',
        "is_published" BOOLEAN NOT NULL DEFAULT false,
        "published_at" TIMESTAMPTZ NULL,
        "created_by"   UUID NULL,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"   TIMESTAMPTZ NULL,
        CONSTRAINT "pk_tenant_cookie_policies" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cookie_policy_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cookie_policy_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_cookie_policies"
        ADD CONSTRAINT "uq_cookie_policy_tenant_version_lang"
        UNIQUE ("tenant_id", "version", "language")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_cookie_policy_public_lookup"
        ON "tenant_cookie_policies" ("tenant_id", "language", "is_published", "version" DESC)
    `);

    // Task 2: cookie_consent_records table
    await queryRunner.query(`
      CREATE TABLE "cookie_consent_records" (
        "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"      UUID NOT NULL,
        "client_id"      UUID NULL,
        "necessary"      BOOLEAN NOT NULL DEFAULT true,
        "analytics"      BOOLEAN NOT NULL DEFAULT false,
        "marketing"      BOOLEAN NOT NULL DEFAULT false,
        "functional"     BOOLEAN NOT NULL DEFAULT false,
        "policy_version" INTEGER NULL,
        "ip_address"     VARCHAR(45) NULL,
        "user_agent"     TEXT NULL,
        "consented_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_cookie_consent_records" PRIMARY KEY ("id"),
        CONSTRAINT "fk_cookie_consent_client"
          FOREIGN KEY ("client_id") REFERENCES "end_clients"("id") ON DELETE SET NULL
      )
    `);

    // Partial unique index — only when client_id IS NOT NULL
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_cookie_consent_tenant_client"
        ON "cookie_consent_records" ("tenant_id", "client_id")
        WHERE "client_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_cookie_consent_client_lookup"
        ON "cookie_consent_records" ("client_id", "tenant_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_cookie_consent_client_lookup"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_cookie_consent_tenant_client"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "cookie_consent_records"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_cookie_policy_public_lookup"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_cookie_policies"`);
  }
}
