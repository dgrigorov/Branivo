import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthProviderToEndClients1710000066000 implements MigrationInterface {
  name = 'AddAuthProviderToEndClients1710000066000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Make phone_number nullable — Google OAuth users have no phone initially
    await queryRunner.query(`
      ALTER TABLE end_clients
        ALTER COLUMN phone_number DROP NOT NULL
    `);

    // Drop old unique index and recreate with nullable-aware WHERE clause
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uidx_end_clients_tenant_phone"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uidx_end_clients_tenant_phone"
        ON "end_clients" ("tenant_id", "phone_number")
        WHERE "deleted_at" IS NULL AND "phone_number" IS NOT NULL
    `);

    // auth_provider: 'sms' | 'google' | 'apple'
    await queryRunner.query(`
      ALTER TABLE end_clients
        ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'sms'
    `);

    // google_sub — stable Google user identifier (sub from ID token)
    await queryRunner.query(`
      ALTER TABLE end_clients
        ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255) NULL
    `);

    // apple_sub — reserved for Story 15-3
    await queryRunner.query(`
      ALTER TABLE end_clients
        ADD COLUMN IF NOT EXISTS apple_sub VARCHAR(255) NULL
    `);

    // Unique index: one google_sub per tenant (NULL values excluded by WHERE clause)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uidx_end_clients_tenant_google_sub"
        ON "end_clients" ("tenant_id", "google_sub")
        WHERE "google_sub" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uidx_end_clients_tenant_google_sub"`,
    );
    await queryRunner.query(
      `ALTER TABLE end_clients DROP COLUMN IF EXISTS apple_sub`,
    );
    await queryRunner.query(
      `ALTER TABLE end_clients DROP COLUMN IF EXISTS google_sub`,
    );
    await queryRunner.query(
      `ALTER TABLE end_clients DROP COLUMN IF EXISTS auth_provider`,
    );
    // Restore NOT NULL constraint and original index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uidx_end_clients_tenant_phone"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uidx_end_clients_tenant_phone"
        ON "end_clients" ("tenant_id", "phone_number")
        WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE end_clients
        ALTER COLUMN phone_number SET NOT NULL
    `);
  }
}
