import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentsTable1710000014000 implements MigrationInterface {
  name = 'CreatePaymentsTable1710000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "quote_id" UUID NOT NULL REFERENCES "quotes"("id"),
        "end_client_id" UUID REFERENCES "end_clients"("id"),
        "stripe_payment_intent_id" VARCHAR(255) NOT NULL UNIQUE,
        "idempotency_key" VARCHAR(255) NOT NULL UNIQUE,
        "amount" DECIMAL(10,2) NOT NULL,
        "currency" VARCHAR(3) NOT NULL DEFAULT 'BGN',
        "application_fee_amount" DECIMAL(10,2) NOT NULL,
        "platform_fee_pct" DECIMAL(5,4) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
        "stripe_client_secret" VARCHAR(500) NOT NULL,
        "failure_reason" VARCHAR(500),
        "metadata" JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_payments_tenant_id" ON "payments" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_quote_id" ON "payments" ("quote_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_stripe_payment_intent_id" ON "payments" ("stripe_payment_intent_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payments_idempotency_key" ON "payments" ("idempotency_key")`,
    );

    await queryRunner.query(`
      ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY
    `);
    await queryRunner.query(`
      CREATE POLICY "payments_tenant_isolation"
      ON "payments"
      USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "payments_tenant_isolation" ON "payments"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payments_idempotency_key"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payments_stripe_payment_intent_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_quote_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payments_tenant_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
  }
}
