import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantBillingFields1710000020000 implements MigrationInterface {
  name = 'AddTenantBillingFields1710000020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS monthly_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants
        DROP COLUMN IF EXISTS monthly_fee,
        DROP COLUMN IF EXISTS activated_at
    `);
  }
}
