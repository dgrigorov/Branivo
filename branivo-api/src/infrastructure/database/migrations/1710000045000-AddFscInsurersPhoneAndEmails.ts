import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFscInsurersPhoneAndEmails1710000045000 implements MigrationInterface {
  name = 'AddFscInsurersPhoneAndEmails1710000045000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      ADD COLUMN IF NOT EXISTS "contact_phone" TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      ADD COLUMN IF NOT EXISTS "contact_emails" TEXT[] NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      DROP COLUMN IF EXISTS "contact_emails"
    `);
    await queryRunner.query(`
      ALTER TABLE "fsc_insurers"
      DROP COLUMN IF EXISTS "contact_phone"
    `);
  }
}
