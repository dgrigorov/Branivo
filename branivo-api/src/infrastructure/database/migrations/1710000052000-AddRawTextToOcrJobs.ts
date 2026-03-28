import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRawTextToOcrJobs1710000052000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ocr_jobs
        ADD COLUMN IF NOT EXISTS raw_text TEXT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ocr_jobs
        DROP COLUMN IF EXISTS raw_text;
    `);
  }
}
