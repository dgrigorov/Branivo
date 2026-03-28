import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFscInsurerIdToInsurers1710000055000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE insurers
        ADD COLUMN IF NOT EXISTS fsc_insurer_id UUID NULL
          REFERENCES fsc_insurers(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS logo_url       VARCHAR(1000) NULL,
        ADD COLUMN IF NOT EXISTS description    TEXT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_insurers_fsc_insurer_id
        ON insurers (fsc_insurer_id)
        WHERE fsc_insurer_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_insurers_fsc_insurer_id`);
    await queryRunner.query(`
      ALTER TABLE insurers
        DROP COLUMN IF EXISTS fsc_insurer_id,
        DROP COLUMN IF EXISTS logo_url,
        DROP COLUMN IF EXISTS description
    `);
  }
}
