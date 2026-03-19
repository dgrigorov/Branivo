import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOcrJobsTable1710000010000 implements MigrationInterface {
  name = 'CreateOcrJobsTable1710000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "ocr_job_status_enum" AS ENUM (
        'pending', 'processing', 'completed', 'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "ocr_provider_enum" AS ENUM (
        'google_vision', 'aws_textract'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ocr_jobs" (
        "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"        UUID          NOT NULL,
        "session_token"    VARCHAR(255)  NOT NULL,
        "client_id"        UUID          NULL,
        "status"           "ocr_job_status_enum" NOT NULL DEFAULT 'pending',
        "provider"         "ocr_provider_enum"   NULL,
        "images_count"     SMALLINT     NOT NULL DEFAULT 0,
        "result"           JSONB         NULL,
        "confidence_scores" JSONB        NULL,
        "error_message"    TEXT          NULL,
        "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMPTZ  NULL,
        CONSTRAINT "PK_ocr_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ocr_jobs_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ocr_jobs_client" FOREIGN KEY ("client_id")
          REFERENCES "end_clients" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_ocr_jobs_tenant_id"
        ON "ocr_jobs" ("tenant_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_ocr_jobs_session_token"
        ON "ocr_jobs" ("session_token")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_ocr_jobs_status"
        ON "ocr_jobs" ("status")
    `);

    await queryRunner.query(`
      ALTER TABLE "ocr_jobs" ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      CREATE POLICY "ocr_jobs_tenant_isolation"
        ON "ocr_jobs"
        USING (tenant_id::text = current_setting('app.current_tenant_id', true))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "ocr_jobs_tenant_isolation" ON "ocr_jobs"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ocr_jobs_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ocr_jobs_session_token"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ocr_jobs_tenant_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ocr_jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ocr_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ocr_job_status_enum"`);
  }
}
