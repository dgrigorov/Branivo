import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRenewalNotificationLog1710000022000 implements MigrationInterface {
  name = 'CreateRenewalNotificationLog1710000022000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS renewal_notification_log (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    UUID NOT NULL,
        policy_id    UUID NOT NULL,
        stage        VARCHAR(20) NOT NULL,
        queued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (policy_id, stage)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_renewal_notification_log_tenant_id
        ON renewal_notification_log(tenant_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS renewal_notification_log`);
  }
}
