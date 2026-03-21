import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

const DEMO_TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

/**
 * Dev-only seeder — runs once on startup.
 * Skips silently if the demo tenant already exists.
 * Does NOT run in production.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('NODE_ENV') === 'production') return;

    const exists = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM tenants WHERE id = $1`,
      [DEMO_TENANT_ID],
    );

    if (exists.length > 0) {
      this.logger.log('Seed already applied — skipping.');
      return;
    }

    this.logger.log('Seeding demo data…');
    await this.seedTenant();
    await this.seedTenantConfig();
    await this.seedTenantDomains();
    await this.seedUsers();
    const clientId = await this.seedEndClients();
    await this.seedVehicles(clientId);
    await this.seedTenantInvitation();
    await this.seedInsurers();
    await this.seedCommissionMatrix();
    await this.seedPolicies();
    await this.seedDemoCommissions();

    this.logger.log('Demo seed complete. Login: admin@branivo.bg / Admin1234!');
  }

  private async seedTenant(): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO tenants (id, slug, name, status, plan, features)
       VALUES ($1, 'demo', 'Demo Broker', 'active', 'starter',
         '{"fleet": false, "api_access": false, "custom_domain": true, "sticker_delivery": true}')`,
      [DEMO_TENANT_ID],
    );
  }

  private async seedTenantConfig(): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO tenant_configs (id, tenant_id, primary_color, secondary_color, support_email, support_phone)
       VALUES (gen_random_uuid(), $1, '#1A56DB', '#6B7280', 'support@demo.com', '+359 2 000 0000')`,
      [DEMO_TENANT_ID],
    );
  }

  private async seedTenantDomains(): Promise<void> {
    // localhost for local dev
    await this.dataSource.query(
      `INSERT INTO tenant_domains (id, tenant_id, domain, is_primary, status)
       VALUES (gen_random_uuid(), $1, 'localhost', true, 'active')`,
      [DEMO_TENANT_ID],
    );
    // 127.0.0.1 as alias
    await this.dataSource.query(
      `INSERT INTO tenant_domains (id, tenant_id, domain, is_primary, status)
       VALUES (gen_random_uuid(), $1, '127.0.0.1', false, 'active')`,
      [DEMO_TENANT_ID],
    );
  }

  private async seedUsers(): Promise<void> {
    const adminHash = await bcrypt.hash('Admin1234!', 12);
    const agentHash = await bcrypt.hash('Agent1234!', 12);

    // Broker admin
    await this.dataSource.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, two_fa_enabled)
       VALUES (gen_random_uuid(), $1, 'admin@branivo.bg', $2, 'broker_admin', false)`,
      [DEMO_TENANT_ID, adminHash],
    );

    // Broker agent
    await this.dataSource.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, two_fa_enabled)
       VALUES (gen_random_uuid(), $1, 'agent@branivo.bg', $2, 'broker_agent', false)`,
      [DEMO_TENANT_ID, agentHash],
    );
  }

  private async seedEndClients(): Promise<string> {
    const result = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO end_clients (id, tenant_id, phone_number, phone_verified, first_name, last_name)
       VALUES (gen_random_uuid(), $1, '+359881234567', true, 'Иван', 'Иванов')
       RETURNING id`,
      [DEMO_TENANT_ID],
    );
    return result[0].id;
  }

  private async seedVehicles(clientId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO vehicles (
         id, tenant_id, owner_id, vin, license_plate,
         make, model, year, color, engine_volume, fuel_type, first_registration_date
       ) VALUES (
         gen_random_uuid(), $1, $2,
         'WAUZZZ8K79A123456', 'CB1234AB',
         'Volkswagen', 'Golf', 2019, 'Черен', '1.6', 'Дизел', '2019-03-15'
       )`,
      [DEMO_TENANT_ID, clientId],
    );
  }

  private async seedTenantInvitation(): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO tenant_invitations (id, tenant_id, email, token, status, expires_at)
       VALUES (
         gen_random_uuid(), $1, 'newagent@branivo.bg',
         'demo-invitation-token-not-valid',
         'pending',
         NOW() + INTERVAL '7 days'
       )`,
      [DEMO_TENANT_ID],
    );
  }

  private async seedInsurers(): Promise<void> {
    const insurers = [
      {
        code: 'allianz',
        name: 'Allianz Bulgaria',
        rating: 4.5,
        claimSpeed: 8.5,
      },
      {
        code: 'generali',
        name: 'Generali Bulgaria',
        rating: 4.2,
        claimSpeed: 7.8,
      },
      { code: 'dsk', name: 'ДЗИ (DSK)', rating: 4.0, claimSpeed: 7.0 },
      { code: 'bulstrad', name: 'Булстрад', rating: 3.8, claimSpeed: 6.5 },
    ];
    for (const ins of insurers) {
      await this.dataSource.query(
        `INSERT INTO insurers (id, name, code, is_active, rating, claim_speed, extras_config, adapter_class)
         VALUES (gen_random_uuid(), $1, $2, true, $3, $4, '{"roadside_assistance": true, "glass": true, "legal": false}', 'MockInsurerAdapter')
         ON CONFLICT (code) DO NOTHING`,
        [ins.name, ins.code, ins.rating, ins.claimSpeed],
      );
    }
    this.logger.log('Insurers seeded.');
  }

  private async seedCommissionMatrix(): Promise<void> {
    const insurers = await this.dataSource.query<
      { id: string; code: string }[]
    >(
      `SELECT id, code FROM insurers WHERE code IN ('allianz', 'generali', 'dsk', 'bulstrad')`,
    );

    for (const ins of insurers) {
      let ratePct: number;
      if (ins.code === 'allianz') ratePct = 0.05;
      else if (ins.code === 'generali') ratePct = 0.045;
      else if (ins.code === 'dsk') ratePct = 0.05;
      else ratePct = 0.055; // bulstrad

      await this.dataSource.query(
        `INSERT INTO commission_matrix (insurer_id, product_type, rate_pct)
         VALUES ($1, 'GO', $2)
         ON CONFLICT (insurer_id, product_type) DO NOTHING`,
        [ins.id, ratePct],
      );
    }
    this.logger.log('Commission matrix seeded.');
  }

  private async seedPolicies(): Promise<void> {
    // Seed demo policies only if payments and quotes exist
    const payments = await this.dataSource.query<
      { id: string; quote_id: string; tenant_id: string }[]
    >(
      `SELECT id, quote_id, tenant_id FROM payments WHERE tenant_id = $1 LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    if (payments.length === 0) return;

    const payment = payments[0];
    const insurer = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM insurers WHERE code = 'allianz' LIMIT 1`,
    );
    const insurerId = insurer[0]?.id ?? '';

    await this.dataSource.query(
      `INSERT INTO policies
         (id, tenant_id, payment_id, quote_id, insurer_id, policy_number,
          status, stripe_payment_intent_id, premium_amount, commission_amount,
          commission_pct, currency, metadata)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, 'DEMO-SEED-001',
          'active', 'pi_demo_seed_001', 450.00, 22.50, 0.05, 'BGN', '{}')
       ON CONFLICT (policy_number) DO NOTHING`,
      [DEMO_TENANT_ID, payment.id, payment.quote_id, insurerId],
    );
    this.logger.log('Policies seeded.');
  }

  private async seedDemoCommissions(): Promise<void> {
    // Seed 1-2 demo pending_commission_events за demo тенанта
    const payments = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM payments WHERE tenant_id = $1 LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    if (payments.length === 0) return;

    const insurer = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM insurers WHERE code = 'generali' LIMIT 1`,
    );
    if (insurer.length === 0) return;

    await this.dataSource.query(
      `INSERT INTO pending_commission_events
         (id, tenant_id, payment_id, insurer_id, product_type,
          premium_amount, commission_pct, commission_amount, status)
       VALUES
         (gen_random_uuid(), $1, $2, $3, 'GO', 320.00, 0.045, 14.40, 'pending')
       ON CONFLICT DO NOTHING`,
      [DEMO_TENANT_ID, payments[0].id, insurer[0].id],
    );
    this.logger.log('Demo commission events seeded.');
  }
}
