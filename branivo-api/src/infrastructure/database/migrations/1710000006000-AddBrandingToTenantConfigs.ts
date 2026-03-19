import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrandingToTenantConfigs1710000006000 implements MigrationInterface {
  name = 'AddBrandingToTenantConfigs1710000006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_configs"
        ADD COLUMN IF NOT EXISTS "secondary_color" VARCHAR(7) NULL,
        ADD COLUMN IF NOT EXISTS "brand_font" VARCHAR(32) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_configs" DROP COLUMN IF EXISTS "brand_font"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_configs" DROP COLUMN IF EXISTS "secondary_color"`,
    );
  }
}
