import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPdfColumnsToPolicy1710000016000 implements MigrationInterface {
  name = 'AddPdfColumnsToPolicy1710000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "policies"
        ADD COLUMN IF NOT EXISTS "policy_pdf_s3_key" VARCHAR(500),
        ADD COLUMN IF NOT EXISTS "green_card_pdf_s3_key" VARCHAR(500),
        ADD COLUMN IF NOT EXISTS "documents_emailed_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "policies" DROP COLUMN IF EXISTS "documents_emailed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "policies" DROP COLUMN IF EXISTS "green_card_pdf_s3_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "policies" DROP COLUMN IF EXISTS "policy_pdf_s3_key"`,
    );
  }
}
