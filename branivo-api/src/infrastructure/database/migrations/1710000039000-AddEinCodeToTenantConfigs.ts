import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEinCodeToTenantConfigs1710000039000 implements MigrationInterface {
  name = 'AddEinCodeToTenantConfigs1710000039000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_configs"
        ADD COLUMN IF NOT EXISTS "ein_code" VARCHAR(13) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_configs" DROP COLUMN IF EXISTS "ein_code"`,
    );
  }
}
