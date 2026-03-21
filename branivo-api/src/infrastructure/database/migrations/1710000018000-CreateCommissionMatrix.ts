import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommissionMatrix1710000018000 implements MigrationInterface {
  name = 'CreateCommissionMatrix1710000018000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commission_matrix (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        insurer_id   UUID NOT NULL REFERENCES insurers(id),
        product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('GO', 'KASKO', 'PROPERTY')),
        rate_pct     DECIMAL(5, 4) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 1),
        created_by   UUID NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (insurer_id, product_type)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commission_matrix_insurer ON commission_matrix(insurer_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_commission_matrix_insurer;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS commission_matrix;`);
  }
}
