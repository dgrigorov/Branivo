import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManualFallbackToInsurers1710000029000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE insurers
        ADD COLUMN IF NOT EXISTS is_manually_disabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS disabled_reason TEXT,
        ADD COLUMN IF NOT EXISTS disabled_by_admin_id UUID
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE insurers
        DROP COLUMN IF EXISTS is_manually_disabled,
        DROP COLUMN IF EXISTS disabled_reason,
        DROP COLUMN IF EXISTS disabled_by_admin_id
    `);
  }
}
