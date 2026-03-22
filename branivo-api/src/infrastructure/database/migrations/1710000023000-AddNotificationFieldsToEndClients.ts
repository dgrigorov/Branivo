import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationFieldsToEndClients1710000023000 implements MigrationInterface {
  name = 'AddNotificationFieldsToEndClients1710000023000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE end_clients ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE end_clients ADD COLUMN IF NOT EXISTS push_token TEXT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE end_clients DROP COLUMN IF EXISTS push_token`,
    );
    await queryRunner.query(
      `ALTER TABLE end_clients DROP COLUMN IF EXISTS email`,
    );
  }
}
