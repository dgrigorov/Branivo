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
    await this.seedInsurerManualFallbackDefaults();
    await this.seedCommissionMatrix();
    await this.seedPolicies();
    await this.seedDemoCommissions();
    await this.seedDemoInvoices();
    await this.seedTenantRenewalConfig();
    await this.seedFleetVehicles();
    await this.seedFleetPdfExports();
    await this.seedTenantHealthData();

    this.logger.log('Demo seed complete. Login: admin@branivo.bg / Admin1234!');
  }

  private async seedTenant(): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO tenants (id, slug, name, status, plan, features, monthly_fee, activated_at)
       VALUES ($1, 'demo', 'Demo Broker', 'active', 'starter',
         '{"fleet": true, "api_access": false, "custom_domain": true, "sticker_delivery": true}',
         99.00, NOW() - INTERVAL '3 months')`,
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
    const driverHash = await bcrypt.hash('Driver1234!', 12);

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

    // Demo driver — sees only assigned vehicles
    await this.dataSource.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, two_fa_enabled)
       VALUES ('bbbbbbbb-0000-0000-0000-000000000002', $1, 'driver@branivo.bg', $2, 'driver', false)`,
      [DEMO_TENANT_ID, driverHash],
    );
  }

  private async seedEndClients(): Promise<string> {
    const result = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO end_clients (id, tenant_id, phone_number, phone_verified, first_name, last_name, email, push_token)
       VALUES (gen_random_uuid(), $1, '+359881234567', true, 'Иван', 'Иванов', 'demo.client@example.com', NULL)
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

  private async seedInsurerManualFallbackDefaults(): Promise<void> {
    // Идемпотентно — гарантира, че всички insurers имат is_manually_disabled = false след migration
    await this.dataSource.query(`
      UPDATE insurers
      SET is_manually_disabled = false
      WHERE is_manually_disabled IS NULL
    `);
    this.logger.log('Insurer manual fallback defaults confirmed.');
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

  private async seedDemoInvoices(): Promise<void> {
    // Two paid invoices for the last two months
    await this.dataSource.query(
      `INSERT INTO invoices
         (id, tenant_id, period_start, period_end, policies_count, total_premium,
          platform_fee, subscription_fee, amount_due, is_pro_rata, status)
       VALUES
         (gen_random_uuid(), $1,
          date_trunc('month', NOW() - INTERVAL '2 months')::date,
          (date_trunc('month', NOW() - INTERVAL '1 month') - INTERVAL '1 day')::date,
          5, 2250.00, 112.50, 99.00, 211.50, false, 'paid'),
         (gen_random_uuid(), $1,
          date_trunc('month', NOW() - INTERVAL '1 month')::date,
          (date_trunc('month', NOW()) - INTERVAL '1 day')::date,
          8, 3600.00, 180.00, 99.00, 279.00, false, 'paid')
       ON CONFLICT DO NOTHING`,
      [DEMO_TENANT_ID],
    );
    this.logger.log('Demo invoices seeded.');
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

  private async seedTenantRenewalConfig(): Promise<void> {
    const defaultStages = [
      { stage: 'd_minus_30', channels: ['push'], enabled: true },
      { stage: 'd_minus_7', channels: ['push'], enabled: true },
      { stage: 'd_minus_3', channels: ['sms'], enabled: true },
      { stage: 'd_minus_1', channels: ['email'], enabled: true },
      { stage: 'd_plus_1', channels: ['dashboard'], enabled: true },
    ];

    await this.dataSource.query(
      `INSERT INTO tenant_renewal_config (tenant_id, stages_config)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [DEMO_TENANT_ID, JSON.stringify(defaultStages)],
    );
    this.logger.log('Demo tenant renewal config seeded.');
  }

  private async seedFleetVehicles(): Promise<void> {
    // Get a client id to associate with the vehicles
    const clients = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM end_clients WHERE tenant_id = $1 LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    if (clients.length === 0) {
      this.logger.log('No end clients found for fleet seed — skipping.');
      return;
    }
    const clientId = clients[0].id;

    const insurer = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM insurers WHERE code = 'allianz' LIMIT 1`,
    );
    const insurerId = insurer[0]?.id ?? '';

    const now = new Date();

    const fleetVehicles = [
      {
        vin: 'DEMO1FLEET00000001',
        plate: 'КА0001ФЛ',
        make: 'BMW',
        model: 'X5',
        daysOffset: 60,
        label: 'green (60d)',
      },
      {
        vin: 'DEMO1FLEET00000002',
        plate: 'КА0002ФЛ',
        make: 'Mercedes',
        model: 'C-Class',
        daysOffset: 20,
        label: 'yellow (20d)',
      },
      {
        vin: 'DEMO1FLEET00000003',
        plate: 'КА0003ФЛ',
        make: 'Audi',
        model: 'A4',
        daysOffset: 7,
        label: 'yellow (7d)',
      },
      {
        vin: 'DEMO1FLEET00000004',
        plate: 'КА0004ФЛ',
        make: 'Ford',
        model: 'Focus',
        daysOffset: -5,
        label: 'red (expired)',
      },
      {
        vin: 'DEMO1FLEET00000005',
        plate: 'КА0005ФЛ',
        make: 'Renault',
        model: 'Megane',
        daysOffset: null,
        label: 'red (no policy)',
      },
    ];

    for (const v of fleetVehicles) {
      const vResult = await this.dataSource.query<{ id: string }[]>(
        `INSERT INTO vehicles (id, tenant_id, owner_id, vin, license_plate, make, model, year)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 2022)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [DEMO_TENANT_ID, clientId, v.vin, v.plate, v.make, v.model],
      );
      if (vResult.length === 0) continue;
      const newVehicleId = vResult[0].id;

      await this.dataSource.query(
        `INSERT INTO fleet_vehicles (id, tenant_id, vehicle_id)
         VALUES (gen_random_uuid(), $1, $2)
         ON CONFLICT DO NOTHING`,
        [DEMO_TENANT_ID, newVehicleId],
      );

      if (v.daysOffset !== null && insurerId) {
        const coverageEnd = new Date(now);
        coverageEnd.setDate(coverageEnd.getDate() + v.daysOffset);
        const coverageEndStr = coverageEnd.toISOString().split('T')[0];

        await this.dataSource.query(
          `INSERT INTO policies
             (id, tenant_id, payment_id, quote_id, insurer_id, policy_number, status,
              stripe_payment_intent_id, premium_amount, commission_amount, commission_pct,
              currency, vehicle_id, coverage_end_date, metadata)
           VALUES
             (gen_random_uuid(), $1,
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000002',
              $2, $3, 'active', 'pi_fleet_seed', 500.00, 25.00, 0.05, 'BGN', $4, $5, '{}')
           ON CONFLICT (policy_number) DO NOTHING`,
          [
            DEMO_TENANT_ID,
            insurerId,
            `FLEET-SEED-${v.plate}`,
            newVehicleId,
            coverageEndStr,
          ],
        );
      }
      this.logger.log(`Fleet vehicle seeded: ${v.plate} (${v.label})`);
    }

    // Assign first fleet vehicle (green) to the demo driver
    const DEMO_DRIVER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
    await this.dataSource.query(
      `UPDATE fleet_vehicles
       SET driver_user_id = $1
       WHERE tenant_id = $2
         AND vehicle_id = (
           SELECT id FROM vehicles
           WHERE tenant_id = $2 AND vin = 'DEMO1FLEET00000001'
           LIMIT 1
         )`,
      [DEMO_DRIVER_ID, DEMO_TENANT_ID],
    );

    this.logger.log(
      'Fleet vehicles seeded (5 vehicles: 1 green, 2 yellow, 1 red-expired, 1 red-no-policy). 1 assigned to demo driver.',
    );
  }

  private async seedFleetPdfExports(): Promise<void> {
    const adminRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM users WHERE tenant_id = $1 AND role = 'broker_admin' LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    const adminId = adminRows[0]?.id;
    if (!adminId) return;

    const policyRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM policies WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 3`,
      [DEMO_TENANT_ID],
    );
    const policyIds = policyRows.map((r) => r.id);
    if (policyIds.length === 0) return;

    await this.dataSource.query(
      `INSERT INTO fleet_pdf_exports
         (tenant_id, requested_by, policy_ids, status, total_count, completed_count,
          failed_count, failed_policy_ids, zip_s3_key, expires_at)
       VALUES ($1, $2, $3, 'completed', $4, $4, 0, '[]',
         $5, NOW() + INTERVAL '24 hours')
       ON CONFLICT DO NOTHING`,
      [
        DEMO_TENANT_ID,
        adminId,
        JSON.stringify(policyIds),
        policyIds.length,
        `${DEMO_TENANT_ID}/fleet/exports/demo-export-id/policies.zip`,
      ],
    );
    this.logger.log('Fleet PDF export demo record seeded.');
  }

  private async seedTenantHealthData(): Promise<void> {
    // Ensure demo tenant has subscription_tier set in tenant_configs
    await this.dataSource.query(
      `UPDATE tenant_configs
       SET subscription_tier = 'starter'
       WHERE tenant_id = $1
         AND subscription_tier IS NULL`,
      [DEMO_TENANT_ID],
    );

    // Ensure at least 3 recent policies exist for the demo tenant (for health dashboard)
    const recentPolicies = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM policies
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [DEMO_TENANT_ID],
    );
    const count = Number(recentPolicies[0]?.count ?? 0);

    if (count < 3) {
      const insurerRows = await this.dataSource.query<{ id: string }[]>(
        `SELECT id FROM insurers WHERE deleted_at IS NULL LIMIT 1`,
      );
      const insurerId = insurerRows[0]?.id;
      if (!insurerId) {
        this.logger.warn(
          'No insurers found — skipping health demo policies seed.',
        );
        return;
      }

      for (let i = count; i < 3; i++) {
        await this.dataSource.query(
          `INSERT INTO policies
             (id, tenant_id, payment_id, quote_id, insurer_id, policy_number, status,
              stripe_payment_intent_id, premium_amount, commission_amount, commission_pct,
              currency, coverage_end_date, metadata, created_at)
           VALUES
             (gen_random_uuid(), $1,
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000002',
              $2, $3, 'active', 'pi_health_seed', 350.00, 17.50, 0.05, 'BGN',
              NOW() + INTERVAL '1 year', '{}',
              NOW() - ($4 * INTERVAL '1 day'))
           ON CONFLICT (policy_number) DO NOTHING`,
          [DEMO_TENANT_ID, insurerId, `HEALTH-SEED-${i}-${Date.now()}`, i],
        );
      }
    }

    this.logger.log('Tenant health seed data ensured for demo tenant.');
  }
}
