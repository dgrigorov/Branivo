import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTalonFieldsToVehicles1710000059000 implements MigrationInterface {
  name = 'AddTalonFieldsToVehicles1710000059000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vehicles"
        ADD COLUMN IF NOT EXISTS "cert_number"           VARCHAR(20)  NULL,
        ADD COLUMN IF NOT EXISTS "power_kw"              VARCHAR(10)  NULL,
        ADD COLUMN IF NOT EXISTS "seats"                 SMALLINT     NULL,
        ADD COLUMN IF NOT EXISTS "vehicle_category"      VARCHAR(10)  NULL,
        ADD COLUMN IF NOT EXISTS "registration_validity" DATE         NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vehicles"
        DROP COLUMN IF EXISTS "cert_number",
        DROP COLUMN IF EXISTS "power_kw",
        DROP COLUMN IF EXISTS "seats",
        DROP COLUMN IF EXISTS "vehicle_category",
        DROP COLUMN IF EXISTS "registration_validity"
    `);
  }
}
