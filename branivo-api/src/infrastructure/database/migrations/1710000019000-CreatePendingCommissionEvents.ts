import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePendingCommissionEvents1710000019000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pending_commission_events (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL,
        payment_id      UUID NOT NULL REFERENCES payments(id),
        insurer_id      UUID NOT NULL REFERENCES insurers(id),
        product_type    VARCHAR(20) NOT NULL CHECK (product_type IN ('GO', 'KASKO', 'PROPERTY')),
        premium_amount  DECIMAL(10, 2) NOT NULL,
        commission_pct  DECIMAL(5, 4) NOT NULL,
        commission_amount DECIMAL(10, 2) NOT NULL,
        status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'confirmed', 'failed')),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_commission_events_tenant_id
        ON pending_commission_events(tenant_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_commission_events_payment_id
        ON pending_commission_events(payment_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_commission_events_payment_unique
        ON pending_commission_events(payment_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_pending_commission_events_payment_unique`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_pending_commission_events_payment_id`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_pending_commission_events_tenant_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS pending_commission_events`);
  }
}
