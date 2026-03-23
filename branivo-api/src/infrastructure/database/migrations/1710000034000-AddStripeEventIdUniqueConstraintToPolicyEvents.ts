import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStripeEventIdUniqueConstraintToPolicyEvents1710000034000 implements MigrationInterface {
  name = 'AddStripeEventIdUniqueConstraintToPolicyEvents1710000034000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_policy_events_stripe_event_id"
      ON "policy_events" ("stripe_event_id")
      WHERE "stripe_event_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_policy_events_stripe_event_id"`,
    );
  }
}
