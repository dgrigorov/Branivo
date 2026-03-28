import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrustpilotScoreToFscInsurers1710000050000 implements MigrationInterface {
  name = 'AddTrustpilotScoreToFscInsurers1710000050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      ADD COLUMN IF NOT EXISTS "trustpilot_score" DECIMAL(3,1) NULL,
      ADD COLUMN IF NOT EXISTS "trustpilot_reviews_count" INTEGER NULL,
      ADD COLUMN IF NOT EXISTS "trustpilot_enriched_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      DROP COLUMN IF EXISTS "trustpilot_enriched_at",
      DROP COLUMN IF EXISTS "trustpilot_reviews_count",
      DROP COLUMN IF EXISTS "trustpilot_score"
    `);
  }
}
