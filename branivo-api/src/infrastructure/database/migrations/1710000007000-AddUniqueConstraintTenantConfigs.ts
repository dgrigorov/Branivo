import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueConstraintTenantConfigs1710000007000 implements MigrationInterface {
  name = 'AddUniqueConstraintTenantConfigs1710000007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Remove duplicate rows (keep the row with the latest updated_at per tenant)
    await queryRunner.query(`
      DELETE FROM "tenant_configs" a
      USING "tenant_configs" b
      WHERE a.updated_at < b.updated_at
        AND a.tenant_id = b.tenant_id
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_configs"
      ADD CONSTRAINT "uq_tenant_configs_tenant_id" UNIQUE ("tenant_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_configs"
      DROP CONSTRAINT "uq_tenant_configs_tenant_id"
    `);
  }
}
