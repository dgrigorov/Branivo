import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationLog1710000024000 implements MigrationInterface {
  name = 'CreateNotificationLog1710000024000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    UUID NOT NULL,
        policy_id    UUID NOT NULL,
        stage        VARCHAR(20) NOT NULL,
        channel      VARCHAR(20) NOT NULL,
        status       VARCHAR(20) NOT NULL,
        delivered_at TIMESTAMPTZ NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_log_tenant_id
        ON notification_log(tenant_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_log_policy_id
        ON notification_log(policy_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification_log`);
  }
}
