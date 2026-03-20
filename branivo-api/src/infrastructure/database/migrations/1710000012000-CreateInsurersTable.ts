import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInsurersTable1710000012000 implements MigrationInterface {
  name = 'CreateInsurersTable1710000012000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "insurers" (
        "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
        "name"           VARCHAR(255)  NOT NULL,
        "code"           VARCHAR(50)   NOT NULL,
        "is_active"      BOOLEAN       NOT NULL DEFAULT true,
        "rating"         DECIMAL(3,2)  NOT NULL,
        "claim_speed"    DECIMAL(3,1)  NOT NULL,
        "extras_config"  JSONB         NOT NULL DEFAULT '{}',
        "adapter_class"  VARCHAR(100)  NOT NULL,
        "api_endpoint"   VARCHAR(500)  NULL,
        "api_key_enc"    VARCHAR(500)  NULL,
        "created_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "deleted_at"     TIMESTAMPTZ   NULL,
        CONSTRAINT "pk_insurers" PRIMARY KEY ("id"),
        CONSTRAINT "uq_insurers_code" UNIQUE ("code")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "insurers"`);
  }
}
