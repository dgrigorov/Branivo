import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFleetVehicles1710000026000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fleet_vehicles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL REFERENCES tenants(id),
        vehicle_id      UUID NOT NULL REFERENCES vehicles(id),
        driver_user_id  UUID NULL REFERENCES users(id),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ NULL
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_fleet_vehicles_tenant ON fleet_vehicles (tenant_id, deleted_at);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fleet_vehicles`);
  }
}
