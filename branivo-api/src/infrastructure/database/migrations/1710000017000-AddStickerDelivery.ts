import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStickerDelivery1710000017000 implements MigrationInterface {
  name = 'AddStickerDelivery1710000017000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS delivery_address JSONB NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shipments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        policy_id UUID NOT NULL REFERENCES policies(id),
        provider VARCHAR(20) NOT NULL CHECK (provider IN ('speedy', 'econt', 'manual')),
        tracking_number VARCHAR(100) NULL,
        estimated_delivery_date DATE NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'dispatched', 'delivered', 'failed')),
        receipt_s3_key VARCHAR(500) NULL,
        delivery_address JSONB NOT NULL,
        error_message TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_shipments_tenant_id ON shipments(tenant_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_shipments_policy_id ON shipments(policy_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_shipments_policy_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_shipments_tenant_id;`);
    await queryRunner.query(`DROP TABLE IF EXISTS shipments;`);
    await queryRunner.query(
      `ALTER TABLE policies DROP COLUMN IF EXISTS delivery_address;`,
    );
  }
}
