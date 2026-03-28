import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleModifications1710000051000 implements MigrationInterface {
  name = 'AddVehicleModifications1710000051000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add image_url to vehicle_models
    await queryRunner.query(`
      ALTER TABLE "vehicle_models"
      ADD COLUMN IF NOT EXISTS "image_url" TEXT NULL
    `);

    // Create vehicle_modifications table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicle_modifications" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "model_id" UUID NOT NULL,
        "name" VARCHAR(250) NOT NULL,
        "year_from" INT NULL,
        "year_to" INT NULL,
        "engine_type" VARCHAR(30) NULL,
        "engine_size_cc" INT NULL,
        "power_kw" INT NULL,
        "power_hp" INT NULL,
        "body_type" VARCHAR(60) NULL,
        "doors" INT NULL,
        "seats" INT NULL,
        "transmission" VARCHAR(30) NULL,
        "drive" VARCHAR(20) NULL,
        "source" VARCHAR(30) NOT NULL DEFAULT 'manual',
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "PK_vehicle_modifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vehicle_modifications_model_id" FOREIGN KEY ("model_id")
          REFERENCES "vehicle_models"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vehicle_modifications_model_id"
      ON "vehicle_modifications" ("model_id")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicle_modifications_model_name"
      ON "vehicle_modifications" ("model_id", "name")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_modifications"`);
    await queryRunner.query(`
      ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "image_url"
    `);
  }
}
