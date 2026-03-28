import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVehicleCatalogTables1710000047000 implements MigrationInterface {
  name = 'CreateVehicleCatalogTables1710000047000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old integer-based tables created by previous migrations (incompatible schema)
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_engines" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_models" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_makes" CASCADE`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicle_makes" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "name" VARCHAR(120) NOT NULL,
        "normalized_name" VARCHAR(120) NOT NULL,
        "vpic_make_id" INT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "PK_vehicle_makes_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_makes"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicle_makes_normalized_name"
      ON "vehicle_makes" ("normalized_name")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicle_makes_vpic_make_id"
      ON "vehicle_makes" ("vpic_make_id")
      WHERE "vpic_make_id" IS NOT NULL AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vehicle_models" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "make_id" UUID NOT NULL,
        "name" VARCHAR(120) NOT NULL,
        "normalized_name" VARCHAR(120) NOT NULL,
        "vpic_model_id" INT NULL,
        "year_from" INT NULL,
        "year_to" INT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "PK_vehicle_models_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vehicle_models_make_id" FOREIGN KEY ("make_id")
          REFERENCES "vehicle_makes"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "vehicle_models"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_vehicle_models_make_id"
      ON "vehicle_models" ("make_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicle_models_make_id_normalized_name"
      ON "vehicle_models" ("make_id", "normalized_name")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_vehicle_models_vpic_model_id"
      ON "vehicle_models" ("vpic_model_id")
      WHERE "vpic_model_id" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_engines" CASCADE`);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_vehicle_models_vpic_model_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_vehicle_models_make_id_normalized_name"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_vehicle_models_make_id"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "vehicle_models"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_vehicle_makes_vpic_make_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_vehicle_makes_normalized_name"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "vehicle_makes"
    `);
  }
}
