import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsPopularToVehicleMakes1710000053000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE vehicle_makes ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_vehicle_makes_is_popular ON vehicle_makes (is_popular) WHERE deleted_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_vehicle_makes_is_popular`,
    );
    await queryRunner.query(
      `ALTER TABLE vehicle_makes DROP COLUMN IF EXISTS is_popular`,
    );
  }
}
