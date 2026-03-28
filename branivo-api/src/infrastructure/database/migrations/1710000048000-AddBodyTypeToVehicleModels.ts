import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBodyTypeToVehicleModels1710000048000 implements MigrationInterface {
  name = 'AddBodyTypeToVehicleModels1710000048000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vehicle_models"
      ADD COLUMN IF NOT EXISTS "body_type" VARCHAR(60) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vehicle_models_body_type"
      ON "vehicle_models" ("body_type")
      WHERE "body_type" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_vehicle_models_body_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "body_type"`,
    );
  }
}
