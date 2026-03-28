import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImageUrlToModifications1710000057000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE vehicle_modifications ADD COLUMN IF NOT EXISTS image_url TEXT`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE vehicle_modifications DROP COLUMN IF EXISTS image_url`,
    );
  }
}
