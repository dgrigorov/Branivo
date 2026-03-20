import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVehiclesTable1710000011000 implements MigrationInterface {
  name = 'CreateVehiclesTable1710000011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "vehicles" (
        "id"                       UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"                UUID          NOT NULL,
        "owner_id"                 UUID          NOT NULL,
        "vin"                      VARCHAR(17)   NOT NULL,
        "license_plate"            VARCHAR(20)   NOT NULL,
        "make"                     VARCHAR(100)  NOT NULL,
        "model"                    VARCHAR(100)  NOT NULL,
        "year"                     INT           NOT NULL,
        "color"                    VARCHAR(50)   NULL,
        "engine_volume"            VARCHAR(20)   NULL,
        "fuel_type"                VARCHAR(30)   NULL,
        "first_registration_date"  DATE          NULL,
        "created_at"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "deleted_at"               TIMESTAMPTZ   NULL,
        CONSTRAINT "pk_vehicles" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vehicles_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vehicles_owner" FOREIGN KEY ("owner_id")
          REFERENCES "end_clients"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_vehicles_tenant_id" ON "vehicles" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_vehicles_owner_id" ON "vehicles" ("owner_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_vehicles_tenant_owner" ON "vehicles" ("tenant_id", "owner_id")`,
    );
    await queryRunner.query(`ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "vehicles_tenant_isolation"
        ON "vehicles"
        USING (tenant_id::text = current_setting('app.current_tenant_id', true))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "vehicles_tenant_isolation" ON "vehicles"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vehicles_tenant_owner"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vehicles_owner_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_vehicles_tenant_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vehicles"`);
  }
}
