import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingTenantConfigColumns1710000036000 implements MigrationInterface {
  name = 'AddMissingTenantConfigColumns1710000036000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenant_configs
        ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenant_configs
        DROP COLUMN IF EXISTS deleted_at,
        DROP COLUMN IF EXISTS subscription_tier
    `);
  }
}
