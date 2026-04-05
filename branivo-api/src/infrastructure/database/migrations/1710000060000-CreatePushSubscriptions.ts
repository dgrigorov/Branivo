import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePushSubscriptions1710000060000 implements MigrationInterface {
  name = 'CreatePushSubscriptions1710000060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "push_subscriptions" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" UUID          NOT NULL,
        "tenant_id"   UUID          NOT NULL,
        "endpoint"    TEXT          NOT NULL,
        "p256dh"      TEXT          NOT NULL,
        "auth"        TEXT          NOT NULL,
        "type"        VARCHAR(10)   NOT NULL DEFAULT 'web',
        "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT "PK_push_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_push_subscriptions_customer" FOREIGN KEY ("customer_id")
          REFERENCES "end_clients" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_push_subscriptions_type"
          CHECK (type IN ('web', 'fcm')),
        CONSTRAINT "UQ_customer_endpoint"
          UNIQUE ("customer_id", "endpoint")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_push_subscriptions_customer"
        ON "push_subscriptions" ("customer_id", "tenant_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      CREATE POLICY "push_subscriptions_tenant_isolation"
        ON "push_subscriptions"
        USING (
          tenant_id::text = current_setting('app.current_tenant_id', true)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "push_subscriptions_tenant_isolation" ON "push_subscriptions"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_push_subscriptions_customer"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "push_subscriptions"`);
  }
}
