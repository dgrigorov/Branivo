import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutodata24Fields1710000054000 implements MigrationInterface {
  name = 'AddAutodata24Fields1710000054000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // vehicle_makes — logo URL + autodata24 slug for cross-reference
    await queryRunner.query(`
      ALTER TABLE "vehicle_makes"
        ADD COLUMN IF NOT EXISTS "logo_url" TEXT NULL,
        ADD COLUMN IF NOT EXISTS "autodata24_slug" VARCHAR(120) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicle_makes_autodata24_slug"
      ON "vehicle_makes" ("autodata24_slug")
      WHERE "autodata24_slug" IS NOT NULL
    `);

    // vehicle_models — autodata24 slug
    await queryRunner.query(`
      ALTER TABLE "vehicle_models"
        ADD COLUMN IF NOT EXISTS "autodata24_slug" VARCHAR(200) NULL
    `);

    // vehicle_modifications — rich data columns + raw JSONB
    await queryRunner.query(`
      ALTER TABLE "vehicle_modifications"
        ADD COLUMN IF NOT EXISTS "max_speed_kmh"          INT         NULL,
        ADD COLUMN IF NOT EXISTS "acceleration_0_100"     NUMERIC(4,1) NULL,
        ADD COLUMN IF NOT EXISTS "fuel_consumption_city"  NUMERIC(4,1) NULL,
        ADD COLUMN IF NOT EXISTS "fuel_consumption_highway" NUMERIC(4,1) NULL,
        ADD COLUMN IF NOT EXISTS "fuel_consumption_combined" NUMERIC(4,1) NULL,
        ADD COLUMN IF NOT EXISTS "weight_kg"              INT         NULL,
        ADD COLUMN IF NOT EXISTS "engine_code"            VARCHAR(60) NULL,
        ADD COLUMN IF NOT EXISTS "raw_data"               JSONB       NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vehicle_modifications"
        DROP COLUMN IF EXISTS "raw_data",
        DROP COLUMN IF EXISTS "engine_code",
        DROP COLUMN IF EXISTS "weight_kg",
        DROP COLUMN IF EXISTS "fuel_consumption_combined",
        DROP COLUMN IF EXISTS "fuel_consumption_highway",
        DROP COLUMN IF EXISTS "fuel_consumption_city",
        DROP COLUMN IF EXISTS "acceleration_0_100",
        DROP COLUMN IF EXISTS "max_speed_kmh"
    `);
    await queryRunner.query(
      `ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "autodata24_slug"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_vehicle_makes_autodata24_slug"`,
    );
    await queryRunner.query(`
      ALTER TABLE "vehicle_makes"
        DROP COLUMN IF EXISTS "autodata24_slug",
        DROP COLUMN IF EXISTS "logo_url"
    `);
  }
}
