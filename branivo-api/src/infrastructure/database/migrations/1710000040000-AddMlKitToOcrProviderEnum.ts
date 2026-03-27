import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMlKitToOcrProviderEnum1710000040000 implements MigrationInterface {
  name = 'AddMlKitToOcrProviderEnum1710000040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "ocr_provider_enum" ADD VALUE IF NOT EXISTS 'ml_kit'
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values — no-op
  }
}
