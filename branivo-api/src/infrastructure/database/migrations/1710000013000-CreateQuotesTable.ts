import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateQuotesTable1710000013000 implements MigrationInterface {
  name = 'CreateQuotesTable1710000013000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "quotes" (
        "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"      UUID           NOT NULL,
        "session_token"  VARCHAR(255)   NOT NULL,
        "vehicle_id"     UUID           NULL,
        "insurer_id"     UUID           NOT NULL,
        "status"         VARCHAR(20)    NOT NULL DEFAULT 'pending',
        "price"          DECIMAL(10,2)  NULL,
        "currency"       VARCHAR(3)     NOT NULL DEFAULT 'BGN',
        "cover_details"  JSONB          NOT NULL DEFAULT '{}',
        "extras"         JSONB          NOT NULL DEFAULT '{}',
        "score"          DECIMAL(5,4)   NULL,
        "is_recommended" BOOLEAN        NOT NULL DEFAULT false,
        "raw_response"   JSONB          NULL,
        "error_message"  VARCHAR(500)   NULL,
        "expires_at"     TIMESTAMPTZ    NOT NULL,
        "created_at"     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        "deleted_at"     TIMESTAMPTZ    NULL,
        CONSTRAINT "pk_quotes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_quotes_insurer" FOREIGN KEY ("insurer_id")
          REFERENCES "insurers"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_quotes_vehicle" FOREIGN KEY ("vehicle_id")
          REFERENCES "vehicles"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_quotes_tenant_id" ON "quotes" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_quotes_session_token" ON "quotes" ("session_token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_quotes_insurer_id" ON "quotes" ("insurer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_quotes_session_token_tenant_id" ON "quotes" ("session_token", "tenant_id")`,
    );
    await queryRunner.query(`ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "quotes_tenant_isolation"
        ON "quotes"
        USING (tenant_id::text = current_setting('app.current_tenant_id', true))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS "quotes_tenant_isolation" ON "quotes"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_quotes_session_token_tenant_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_quotes_insurer_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_quotes_session_token"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_quotes_tenant_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotes"`);
  }
}
