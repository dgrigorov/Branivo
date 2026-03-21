import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePoliciesTable1710000015000 implements MigrationInterface {
  name = 'CreatePoliciesTable1710000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // policies table
    await queryRunner.query(`
      CREATE TABLE "policies" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "payment_id" UUID NOT NULL REFERENCES "payments"("id"),
        "quote_id" UUID NOT NULL REFERENCES "quotes"("id"),
        "end_client_id" UUID REFERENCES "end_clients"("id"),
        "insurer_id" UUID NOT NULL REFERENCES "insurers"("id"),
        "policy_number" VARCHAR(100) NOT NULL UNIQUE,
        "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
        "stripe_payment_intent_id" VARCHAR(255) NOT NULL UNIQUE,
        "premium_amount" DECIMAL(10,2) NOT NULL,
        "commission_amount" DECIMAL(10,2) NOT NULL,
        "commission_pct" DECIMAL(5,4) NOT NULL,
        "currency" VARCHAR(3) NOT NULL DEFAULT 'BGN',
        "vehicle_id" UUID REFERENCES "vehicles"("id"),
        "coverage_start_date" DATE,
        "coverage_end_date" DATE,
        "metadata" JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_policies_tenant_id" ON "policies" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_policies_payment_id" ON "policies" ("payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_policies_stripe_payment_intent_id" ON "policies" ("stripe_payment_intent_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_policies_end_client_id" ON "policies" ("end_client_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_policies_status" ON "policies" ("status")`,
    );

    await queryRunner.query(`ALTER TABLE "policies" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "policies_tenant_isolation"
      ON "policies"
      USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
    `);

    // policy_events table (immutable audit log — no updated_at, deleted_at)
    await queryRunner.query(`
      CREATE TABLE "policy_events" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "policy_id" UUID NOT NULL REFERENCES "policies"("id"),
        "event_type" VARCHAR(50) NOT NULL,
        "payload" JSONB NOT NULL DEFAULT '{}',
        "stripe_event_id" VARCHAR(255),
        "created_by" VARCHAR(100) NOT NULL DEFAULT 'system',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_policy_events_policy_id" ON "policy_events" ("policy_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_policy_events_tenant_id" ON "policy_events" ("tenant_id")`,
    );
    // NOTE: NO RLS on policy_events — written from webhook context without tenant session
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_policy_events_tenant_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_policy_events_policy_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "policy_events"`);

    await queryRunner.query(
      `DROP POLICY IF EXISTS "policies_tenant_isolation" ON "policies"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_policies_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_policies_end_client_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_policies_stripe_payment_intent_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_policies_payment_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_policies_tenant_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "policies"`);
  }
}
