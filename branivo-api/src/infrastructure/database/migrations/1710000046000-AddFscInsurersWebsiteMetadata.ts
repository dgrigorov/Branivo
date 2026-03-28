import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFscInsurersWebsiteMetadata1710000046000 implements MigrationInterface {
  name = 'AddFscInsurersWebsiteMetadata1710000046000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      ADD COLUMN IF NOT EXISTS "long_description" TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      ADD COLUMN IF NOT EXISTS "logo_url" VARCHAR(1000) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      ADD COLUMN IF NOT EXISTS "social_links" JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      ADD COLUMN IF NOT EXISTS "trustpilot_url" VARCHAR(1000) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      ADD COLUMN IF NOT EXISTS "website_enriched_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      DROP COLUMN IF EXISTS "website_enriched_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      DROP COLUMN IF EXISTS "trustpilot_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      DROP COLUMN IF EXISTS "social_links"
    `);
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      DROP COLUMN IF EXISTS "logo_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      DROP COLUMN IF EXISTS "long_description"
    `);
  }
}
