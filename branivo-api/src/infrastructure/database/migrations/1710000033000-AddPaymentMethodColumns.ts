import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodColumns1710000033000 implements MigrationInterface {
  name = 'AddPaymentMethodColumns1710000033000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE payments ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT 'card'`,
    );
    await queryRunner.query(
      `ALTER TABLE payments ADD COLUMN payment_provider VARCHAR(20) NOT NULL DEFAULT 'stripe'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE payments DROP COLUMN IF EXISTS payment_provider`,
    );
    await queryRunner.query(
      `ALTER TABLE payments DROP COLUMN IF EXISTS payment_method`,
    );
  }
}
