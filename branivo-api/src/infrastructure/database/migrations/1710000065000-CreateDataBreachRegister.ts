import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDataBreachRegister1710000065000 implements MigrationInterface {
  name = 'CreateDataBreachRegister1710000065000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "data_breaches" (
        "id"                              UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"                       UUID NULL,
        "title"                           VARCHAR(255) NOT NULL,
        "description"                     TEXT NOT NULL,
        "breach_type"                     VARCHAR(50) NOT NULL,
        "severity"                        VARCHAR(20) NOT NULL,
        "detected_at"                     TIMESTAMPTZ NOT NULL,
        "reported_by"                     UUID NULL,
        "affected_data_categories"        JSONB NOT NULL DEFAULT '[]',
        "affected_subjects_count"         INTEGER NULL,
        "affected_subjects_description"   TEXT NULL,
        "kzld_notification_required"      BOOLEAN NOT NULL DEFAULT true,
        "kzld_notified_at"                TIMESTAMPTZ NULL,
        "kzld_notification_reference"     VARCHAR(255) NULL,
        "kzld_notification_deadline"      TIMESTAMPTZ NOT NULL,
        "client_notification_required"    BOOLEAN NOT NULL DEFAULT false,
        "client_notification_sent_at"     TIMESTAMPTZ NULL,
        "status"                          VARCHAR(30) NOT NULL DEFAULT 'detected',
        "containment_actions"             TEXT NULL,
        "remediation_actions"             TEXT NULL,
        "lessons_learned"                 TEXT NULL,
        "closed_at"                       TIMESTAMPTZ NULL,
        "created_at"                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_data_breaches" PRIMARY KEY ("id"),
        CONSTRAINT "fk_data_breaches_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_data_breaches_reported_by"
          FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_data_breaches_tenant_status"
        ON "data_breaches" ("tenant_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_data_breaches_detected_at"
        ON "data_breaches" ("detected_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_data_breaches_kzld_deadline"
        ON "data_breaches" ("kzld_notification_deadline", "kzld_notified_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "data_breaches"`);
  }
}
