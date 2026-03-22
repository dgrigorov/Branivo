import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFleetRoles1710000028000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Add CHECK constraint to users.role to include fleet_admin and driver
    await queryRunner.query(`
      ALTER TABLE users
        ADD CONSTRAINT chk_users_role
        CHECK (role IN (
          'super_admin',
          'broker_admin',
          'broker_agent',
          'broker_viewer',
          'fleet_admin',
          'driver'
        ))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role
    `);
  }
}
