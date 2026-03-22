import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemNotifications1710000031000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE system_notifications (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id       UUID        NOT NULL,
        target         TEXT        NOT NULL,
        type           VARCHAR(20) NOT NULL,
        message        TEXT        NOT NULL,
        dismissible    BOOLEAN     NOT NULL,
        is_active      BOOLEAN     NOT NULL DEFAULT true,
        sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_system_notifications_target ON system_notifications(target)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_system_notifications_active ON system_notifications(is_active)
    `);

    await queryRunner.query(`
      CREATE TABLE system_notification_dismissals (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id UUID        NOT NULL REFERENCES system_notifications(id) ON DELETE CASCADE,
        tenant_id       UUID        NOT NULL,
        dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(notification_id, tenant_id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS system_notification_dismissals`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS system_notifications`);
  }
}
