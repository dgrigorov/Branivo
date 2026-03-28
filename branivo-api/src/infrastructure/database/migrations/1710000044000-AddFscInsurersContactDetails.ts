import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFscInsurersContactDetails1710000044000 implements MigrationInterface {
  name = 'AddFscInsurersContactDetails1710000044000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      ADD COLUMN IF NOT EXISTS "contact_details" TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      DROP COLUMN IF EXISTS "contact_details"
    `);
  }
}
