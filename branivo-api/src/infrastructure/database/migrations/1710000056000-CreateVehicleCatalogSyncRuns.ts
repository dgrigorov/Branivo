import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVehicleCatalogSyncRuns1710000056000 implements MigrationInterface {
  name = 'CreateVehicleCatalogSyncRuns1710000056000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicle_catalog_sync_runs" (
        "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "status"          VARCHAR(20) NOT NULL DEFAULT 'pending',
        "total_scraped"   INT NULL,
        "total_imported"  INT NULL,
        "error_message"   TEXT NULL,
        "log_lines"       TEXT[] NOT NULL DEFAULT '{}',
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "completed_at"    TIMESTAMPTZ NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_catalog_sync_runs"`);
  }
}
