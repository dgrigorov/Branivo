import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDataExportRequests1710000036000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "data_export_requests" (
        "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id"   UUID NOT NULL,
        "customer_id" UUID NOT NULL REFERENCES "end_clients"("id") ON DELETE CASCADE,
        "status"      VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','completed','failed')),
        "s3_key"      VARCHAR(500) NULL,
        "expires_at"  TIMESTAMPTZ NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX "idx_data_export_requests_customer_id"
        ON "data_export_requests" ("customer_id");
      CREATE INDEX "idx_data_export_requests_tenant_id_created_at"
        ON "data_export_requests" ("tenant_id", "created_at");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "data_export_requests";`);
  }
}
