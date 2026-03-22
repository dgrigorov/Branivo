import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingDowngradeToTenants1710000030000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS pending_downgrade JSONB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants
        DROP COLUMN IF EXISTS pending_downgrade
    `);
  }
}
