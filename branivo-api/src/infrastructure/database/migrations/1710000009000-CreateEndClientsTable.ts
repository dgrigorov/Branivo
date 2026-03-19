import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEndClientsTable1710000009000 implements MigrationInterface {
  name = 'CreateEndClientsTable1710000009000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "end_clients" (
        "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"      UUID NOT NULL,
        "phone_number"   VARCHAR(20) NOT NULL,
        "phone_verified" BOOLEAN NOT NULL DEFAULT false,
        "first_name"     VARCHAR(100) NULL,
        "last_name"      VARCHAR(100) NULL,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"     TIMESTAMPTZ NULL,
        CONSTRAINT "pk_end_clients" PRIMARY KEY ("id"),
        CONSTRAINT "fk_end_clients_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uidx_end_clients_tenant_phone"
        ON "end_clients" ("tenant_id", "phone_number")
        WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_end_clients_tenant_id"
        ON "end_clients" ("tenant_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "end_clients" ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      CREATE POLICY "end_clients_tenant_isolation"
        ON "end_clients"
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "end_clients_tenant_isolation" ON "end_clients"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_end_clients_tenant_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uidx_end_clients_tenant_phone"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "end_clients"`);
  }
}
