import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOcrScansTable1710000058000 implements MigrationInterface {
  name = 'CreateOcrScansTable1710000058000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ocr_scans" (
        "id"                        UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"                 UUID          NOT NULL,
        "user_id"                   UUID          NULL,

        -- Quality metrics
        "blur_variance"             FLOAT         NULL,
        "brightness_avg"            FLOAT         NULL,
        "frame_fill_pct"            FLOAT         NULL,
        "photo_count"               INT           NOT NULL DEFAULT 1,

        -- ML Kit scores
        "mlkit_confidence"          FLOAT         NULL,
        "mlkit_field_confidences"   JSONB         NULL,

        -- Vision fallback
        "vision_used"               BOOLEAN       NOT NULL DEFAULT FALSE,
        "vision_confidence"         FLOAT         NULL,
        "vision_field_confidences"  JSONB         NULL,

        -- Scoring breakdown
        "score_cc"                  FLOAT         NULL,
        "score_kw"                  FLOAT         NULL,
        "score_make"                FLOAT         NULL,
        "score_model"               FLOAT         NULL,
        "score_year"                FLOAT         NULL,
        "final_score"               FLOAT         NULL,
        "score_bucket"              VARCHAR(10)   NULL,

        -- Enrichment results
        "vin_found"                 BOOLEAN       NOT NULL DEFAULT FALSE,
        "kat_hit"                   BOOLEAN       NULL,
        "gf_hit"                    BOOLEAN       NULL,
        "gf_policy_found"           BOOLEAN       NULL,
        "enrichment_duration_ms"    INT           NULL,

        -- Outcome tracking
        "user_corrected_fields"     JSONB         NULL,
        "user_selected_rank"        INT           NULL,
        "final_vehicle_id"          UUID          NULL,
        "quote_initiated"           BOOLEAN       NOT NULL DEFAULT FALSE,

        -- Timestamp (immutable — no updated_at)
        "created_at"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT "PK_ocr_scans" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ocr_scans_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ocr_scans_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_ocr_scans_score_bucket"
          CHECK (score_bucket IN ('auto', 'top3', 'manual') OR score_bucket IS NULL)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_ocr_scans_tenant_created"
        ON "ocr_scans" (tenant_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_ocr_scans_score_bucket"
        ON "ocr_scans" (score_bucket, final_score)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_ocr_scans_vin_found"
        ON "ocr_scans" (vin_found)
        WHERE vin_found = true
    `);

    await queryRunner.query(`
      ALTER TABLE "ocr_scans" ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      CREATE POLICY "ocr_scans_tenant_isolation"
        ON "ocr_scans"
        USING (
          tenant_id::text = current_setting('app.current_tenant_id', true)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "ocr_scans_tenant_isolation" ON "ocr_scans"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ocr_scans_vin_found"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ocr_scans_score_bucket"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ocr_scans_tenant_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ocr_scans"`);
  }
}
