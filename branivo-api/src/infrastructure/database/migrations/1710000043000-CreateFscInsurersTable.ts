import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFscInsurersTable1710000043000 implements MigrationInterface {
  name = 'CreateFscInsurersTable1710000043000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fsc_insurers" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "category_key" VARCHAR(64) NOT NULL,
        "category_label" VARCHAR(128) NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "eik" VARCHAR(20) NULL,
        "office_address" TEXT NULL,
        "website" VARCHAR(500) NULL,
        "source_url" VARCHAR(700) NOT NULL,
        "scraped_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "PK_fsc_insurers" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_fsc_insurers_category_eik_name"
      ON "fsc_insurers" ("category_key", "eik", "name")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_fsc_insurers_category_key"
      ON "fsc_insurers" ("category_key")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_fsc_insurers_name"
      ON "fsc_insurers" ("name")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_fsc_insurers_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_fsc_insurers_category_key"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_fsc_insurers_category_eik_name"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "fsc_insurers"`);
  }
}
