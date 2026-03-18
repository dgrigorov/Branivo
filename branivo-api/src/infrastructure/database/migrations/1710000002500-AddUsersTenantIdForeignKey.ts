import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersTenantIdForeignKey1710000002500 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD CONSTRAINT fk_users_tenant_id
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users DROP CONSTRAINT fk_users_tenant_id
    `);
  }
}
