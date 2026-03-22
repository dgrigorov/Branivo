import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantRenewalConfig1710000025000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tenant_renewal_config (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL UNIQUE,
        stages_config JSONB NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // No explicit index needed: UNIQUE constraint on tenant_id creates an implicit B-tree index
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_renewal_config`);
  }
}
