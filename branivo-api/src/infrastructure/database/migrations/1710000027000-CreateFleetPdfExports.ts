import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFleetPdfExports1710000027000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fleet_pdf_exports (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id         UUID NOT NULL REFERENCES tenants(id),
        requested_by      UUID NOT NULL REFERENCES users(id),
        policy_ids        JSONB NOT NULL,
        status            VARCHAR(20) NOT NULL DEFAULT 'pending',
        total_count       INTEGER NOT NULL DEFAULT 0,
        completed_count   INTEGER NOT NULL DEFAULT 0,
        failed_count      INTEGER NOT NULL DEFAULT 0,
        failed_policy_ids JSONB NOT NULL DEFAULT '[]',
        zip_s3_key        VARCHAR(500) NULL,
        expires_at        TIMESTAMPTZ NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at        TIMESTAMPTZ NULL
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_fleet_pdf_exports_tenant_id ON fleet_pdf_exports(tenant_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_fleet_pdf_exports_status ON fleet_pdf_exports(status);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fleet_pdf_exports`);
  }
}
