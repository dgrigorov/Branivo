import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvoices1710000021000 implements MigrationInterface {
  name = 'CreateInvoices1710000021000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id         UUID NOT NULL,
        period_start      DATE NOT NULL,
        period_end        DATE NOT NULL,
        policies_count    INTEGER NOT NULL DEFAULT 0,
        total_premium     DECIMAL(12, 2) NOT NULL DEFAULT 0,
        platform_fee      DECIMAL(12, 2) NOT NULL DEFAULT 0,
        subscription_fee  DECIMAL(10, 2) NOT NULL DEFAULT 0,
        amount_due        DECIMAL(12, 2) NOT NULL DEFAULT 0,
        is_pro_rata       BOOLEAN NOT NULL DEFAULT FALSE,
        days_active       INTEGER,
        pdf_url           VARCHAR(500),
        status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'paid', 'failed')),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at        TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_period
        ON invoices(tenant_id, period_start)
        WHERE deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id
        ON invoices(tenant_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS invoices`);
  }
}
