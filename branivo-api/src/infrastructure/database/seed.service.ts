import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

const DEMO_TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PREMIUM_TENANT_ID = 'cccccccc-0000-0000-0000-000000000003';

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
    await this.seedDemoTenantIfNeeded();
    await this.seedPremiumTenantIfNeeded();
  }

  private async seedDemoTenantIfNeeded(): Promise<void> {
    const exists = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM tenants WHERE id = $1`,
      [DEMO_TENANT_ID],
    );
    if (exists.length > 0) {
      this.logger.log('Demo tenant exists — skipping.');
      return;
    }

    this.logger.log('Seeding demo data…');
    await this.seedTenant();
    await this.seedSuperAdmin();
    await this.seedTenantConfig();
    await this.seedTenantDomains();
    await this.seedUsers();
    const clientId = await this.seedEndClients();
    await this.seedVehicles(clientId);
    await this.seedTenantInvitation();
    await this.seedInsurers();
    await this.seedInsurerManualFallbackDefaults();
    await this.seedCommissionMatrix();
    await this.seedQuotes();
    await this.seedPayments(clientId);
    await this.seedPolicies();
    await this.seedPolicyEvents();
    await this.seedDemoCommissions();
    await this.seedDemoInvoices();
    await this.seedTenantRenewalConfig();
    await this.seedRenewalNotificationLog();
    await this.seedFleetVehicles();
    await this.seedFleetPdfExports();
    await this.seedOcrJobs(clientId);
    await this.seedShipments();
    await this.seedTenantHealthData();
    await this.seedSystemNotifications();

    this.logger.log(
      'Demo seed complete.\n' +
        '  Broker Admin : admin@branivo.bg / Admin1234!\n' +
        '  Broker Agent : agent@branivo.bg / Agent1234!\n' +
        '  Driver       : driver@branivo.bg / Driver1234!\n' +
        '  Super Admin  : superadmin@branivo.bg / SuperAdmin1234!',
    );
  }

  private async seedPremiumTenantIfNeeded(): Promise<void> {
    const exists = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM tenants WHERE id = $1`,
      [PREMIUM_TENANT_ID],
    );
    if (exists.length > 0) {
      this.logger.log('Premium tenant exists — skipping.');
      return;
    }

    this.logger.log('Seeding Premium Broker tenant…');
    await this.seedPremiumTenant();
    await this.seedPremiumTenantConfig();
    await this.seedPremiumUsers();
    const { clientAId, clientBId, vehicleAId, vehicleBId } =
      await this.seedPremiumClientsAndVehicles();
    await this.seedPremiumPolicies(
      clientAId,
      clientBId,
      vehicleAId,
      vehicleBId,
    );
    await this.seedPremiumInvoices();
    await this.seedPremiumCommissions();

    this.logger.log(
      'Premium Broker seed complete.\n' +
        '  Broker Admin : admin@premium.bg / Admin1234!\n' +
        '  Broker Agent : agent@premium.bg / Agent1234!',
    );
  }

  private async seedSuperAdmin(): Promise<void> {
    // Super admin lives in the demo tenant so that localhost host-resolution works in dev.
    // In production a dedicated system tenant with its own domain would be used.
    const hash = await bcrypt.hash('SuperAdmin1234!', 12);
    await this.dataSource.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, two_fa_enabled)
       VALUES ('00000000-0000-0000-0000-100000000001', $1, 'superadmin@branivo.bg', $2, 'super_admin', false)
       ON CONFLICT DO NOTHING`,
      [DEMO_TENANT_ID, hash],
    );
    this.logger.log('Super admin seeded.');
  }

  private async seedTenant(): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO tenants (id, slug, name, status, plan, features, monthly_fee, activated_at)
       VALUES ($1, 'demo', 'Demo Broker', 'active', 'starter',
         '{"sticker_delivery": true, "dkp": true, "renewal_sms": false, "renewal_push": false}',
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
    const devDomains = [
      'localhost',
      '127.0.0.1',
      '192.168.100.185',
      '10.0.0.1',
    ];
    for (const domain of devDomains) {
      await this.dataSource.query(
        `INSERT INTO tenant_domains (id, tenant_id, domain, is_primary, status)
         VALUES (gen_random_uuid(), $1, $2, $3, 'active')
         ON CONFLICT DO NOTHING`,
        [DEMO_TENANT_ID, domain, domain === 'localhost'],
      );
    }
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
    const clientRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM end_clients WHERE tenant_id = $1 LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    const vehicleRows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM vehicles WHERE tenant_id = $1 LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    const endClientId = clientRows[0]?.id ?? null;
    const vehicleId = vehicleRows[0]?.id ?? null;

    await this.dataSource.query(
      `INSERT INTO policies
         (id, tenant_id, payment_id, quote_id, insurer_id, policy_number,
          status, stripe_payment_intent_id, premium_amount, commission_amount,
          commission_pct, currency, end_client_id, vehicle_id, coverage_start_date, coverage_end_date, metadata)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, 'DEMO-SEED-001',
          'active', 'pi_demo_seed_001', 450.00, 22.50, 0.05, 'BGN', $5, $6,
          CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '335 days',
          '{"source":"seed","has_full_owner_and_vehicle":true}')
       ON CONFLICT (policy_number) DO NOTHING`,
      [
        DEMO_TENANT_ID,
        payment.id,
        payment.quote_id,
        insurerId,
        endClientId,
        vehicleId,
      ],
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
        vin: 'DEMO1FLEET0000001',
        plate: 'КА0001ФЛ',
        make: 'BMW',
        model: 'X5',
        color: 'Черен',
        engineVolume: '3.0',
        fuelType: 'Дизел',
        firstRegistrationDate: '2021-05-10',
        daysOffset: 60,
        label: 'green (60d)',
      },
      {
        vin: 'DEMO1FLEET0000002',
        plate: 'КА0002ФЛ',
        make: 'Mercedes',
        model: 'C-Class',
        color: 'Бял',
        engineVolume: '2.0',
        fuelType: 'Бензин',
        firstRegistrationDate: '2020-11-18',
        daysOffset: 20,
        label: 'yellow (20d)',
      },
      {
        vin: 'DEMO1FLEET0000003',
        plate: 'КА0003ФЛ',
        make: 'Audi',
        model: 'A4',
        color: 'Сив',
        engineVolume: '2.0',
        fuelType: 'Дизел',
        firstRegistrationDate: '2019-03-22',
        daysOffset: 7,
        label: 'yellow (7d)',
      },
      {
        vin: 'DEMO1FLEET0000004',
        plate: 'КА0004ФЛ',
        make: 'Ford',
        model: 'Focus',
        color: 'Син',
        engineVolume: '1.6',
        fuelType: 'Бензин',
        firstRegistrationDate: '2018-06-01',
        daysOffset: -5,
        label: 'red (expired)',
      },
      {
        vin: 'DEMO1FLEET0000005',
        plate: 'КА0005ФЛ',
        make: 'Renault',
        model: 'Megane',
        color: 'Червен',
        engineVolume: '1.5',
        fuelType: 'Дизел',
        firstRegistrationDate: '2017-04-15',
        daysOffset: null,
        label: 'red (no policy)',
      },
    ];

    for (const v of fleetVehicles) {
      const vResult = await this.dataSource.query<{ id: string }[]>(
        `INSERT INTO vehicles
           (id, tenant_id, owner_id, vin, license_plate, make, model, year, color, engine_volume, fuel_type, first_registration_date)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 2022, $7, $8, $9, $10)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          DEMO_TENANT_ID,
          clientId,
          v.vin,
          v.plate,
          v.make,
          v.model,
          v.color,
          v.engineVolume,
          v.fuelType,
          v.firstRegistrationDate,
        ],
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
              currency, end_client_id, vehicle_id, coverage_start_date, coverage_end_date, metadata)
           VALUES
             (gen_random_uuid(), $1,
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000002',
              $2, $3, 'active', $8, 500.00, 25.00, 0.05, 'BGN', $4, $5, $6, $7, '{}')
           ON CONFLICT (policy_number) DO NOTHING`,
          [
            DEMO_TENANT_ID,
            insurerId,
            `FLEET-SEED-${v.plate}`,
            clientId,
            newVehicleId,
            new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
            coverageEndStr,
            `pi_fleet_${v.plate.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          ],
        );

        await this.dataSource.query(
          `UPDATE policies
           SET metadata = $1::jsonb
           WHERE tenant_id = $2 AND policy_number = $3 AND deleted_at IS NULL`,
          [
            JSON.stringify({
              source: 'seed',
              has_full_owner_and_vehicle: true,
              owner: {
                endClientId: clientId,
              },
              vehicle: {
                vin: v.vin,
                licensePlate: v.plate,
                make: v.make,
                model: v.model,
                color: v.color,
                engineVolume: v.engineVolume,
                fuelType: v.fuelType,
                firstRegistrationDate: v.firstRegistrationDate,
              },
            }),
            DEMO_TENANT_ID,
            `FLEET-SEED-${v.plate}`,
          ],
        );
      }
      this.logger.log(`Fleet vehicle seeded: ${v.plate} (${v.label})`);
    }

    // Assign one active and one expired fleet vehicle to the demo driver
    const DEMO_DRIVER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
    await this.dataSource.query(
      `UPDATE fleet_vehicles
       SET driver_user_id = $1
       WHERE tenant_id = $2
         AND vehicle_id = (
           SELECT id FROM vehicles
           WHERE tenant_id = $2 AND vin = 'DEMO1FLEET0000001'
           LIMIT 1
         )`,
      [DEMO_DRIVER_ID, DEMO_TENANT_ID],
    );
    await this.dataSource.query(
      `UPDATE fleet_vehicles
       SET driver_user_id = $1
       WHERE tenant_id = $2
         AND vehicle_id = (
           SELECT id FROM vehicles
           WHERE tenant_id = $2 AND vin = 'DEMO1FLEET0000004'
           LIMIT 1
         )`,
      [DEMO_DRIVER_ID, DEMO_TENANT_ID],
    );

    this.logger.log(
      'Fleet vehicles seeded (5 vehicles: 1 green, 2 yellow, 1 red-expired, 1 red-no-policy). Demo driver has 1 active + 1 expired vehicle policy.',
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

  private async seedSystemNotifications(): Promise<void> {
    await this.dataSource.query(`
      INSERT INTO system_notifications (id, admin_id, target, type, message, dismissible, is_active, sent_at)
      VALUES (
        '00000000-0000-0000-0001-000000000001',
        '00000000-0000-0000-0000-000000000001',
        'all',
        'info',
        'Добре дошли в Branivo! Платформата е активна и готова за използване.',
        true,
        true,
        NOW()
      )
      ON CONFLICT DO NOTHING
    `);
  }

  private async seedQuotes(): Promise<void> {
    const insurer = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM insurers WHERE code = 'allianz' LIMIT 1`,
    );
    const insurerId = insurer[0]?.id;
    if (!insurerId) return;

    const vehicle = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM vehicles WHERE tenant_id = $1 LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    const vehicleId = vehicle[0]?.id ?? null;

    await this.dataSource.query(
      `INSERT INTO quotes
         (id, tenant_id, session_token, vehicle_id, insurer_id, status, price,
          currency, cover_details, extras, score, is_recommended, expires_at)
       VALUES
         ('00000000-0000-0000-0000-000000000002', $1, 'demo-session-token-001', $2, $3,
          'success', 450.00, 'BGN', '{"coverType": "GO"}', '{}', 0.87, true,
          NOW() + INTERVAL '7 days')
       ON CONFLICT DO NOTHING`,
      [DEMO_TENANT_ID, vehicleId, insurerId],
    );
    this.logger.log('Demo quote seeded.');
  }

  private async seedPayments(clientId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO payments
         (id, tenant_id, quote_id, end_client_id, stripe_payment_intent_id, idempotency_key,
          amount, currency, application_fee_amount, platform_fee_pct, status,
          stripe_client_secret, metadata)
       VALUES
         ('00000000-0000-0000-0000-000000000001', $1,
          '00000000-0000-0000-0000-000000000002', $2,
          'pi_demo_seed_001', 'idempotency_demo_seed_001',
          450.00, 'BGN', 22.50, 0.05, 'succeeded',
          'pi_demo_seed_001_secret_demo', '{}')
       ON CONFLICT DO NOTHING`,
      [DEMO_TENANT_ID, clientId],
    );
    this.logger.log('Demo payment seeded.');
  }

  private async seedPolicyEvents(): Promise<void> {
    const policy = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM policies WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    if (policy.length === 0) return;

    await this.dataSource.query(
      `INSERT INTO policy_events (id, tenant_id, policy_id, event_type, payload)
       VALUES
         (gen_random_uuid(), $1, $2, 'policy.activated',
          '{"source": "stripe_webhook", "amount": 450.00}')
       ON CONFLICT DO NOTHING`,
      [DEMO_TENANT_ID, policy[0].id],
    );
    this.logger.log('Demo policy events seeded.');
  }

  private async seedRenewalNotificationLog(): Promise<void> {
    const policy = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM policies WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    if (policy.length === 0) return;

    await this.dataSource.query(
      `INSERT INTO renewal_notification_log (id, tenant_id, policy_id, stage)
       VALUES (gen_random_uuid(), $1, $2, 'd_minus_30')
       ON CONFLICT (policy_id, stage) DO NOTHING`,
      [DEMO_TENANT_ID, policy[0].id],
    );
    this.logger.log('Demo renewal notification log seeded.');
  }

  private async seedOcrJobs(clientId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO ocr_jobs
         (id, tenant_id, session_token, client_id, status, provider,
          images_count, result, confidence_scores)
       VALUES
         (gen_random_uuid(), $1, 'demo-ocr-session-001', $2, 'completed', 'google_vision',
          2,
          '{"licensePlate": "CB1234AB", "vin": "WAUZZZ8K79A123456", "make": "Volkswagen", "model": "Golf", "year": "2019"}',
          '{"licensePlate": 0.97, "vin": 0.89, "make": 0.98, "model": 0.96, "year": 0.99}')
       ON CONFLICT DO NOTHING`,
      [DEMO_TENANT_ID, clientId],
    );
    this.logger.log('Demo OCR job seeded.');
  }

  private async seedShipments(): Promise<void> {
    const policy = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM policies WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    if (policy.length === 0) return;

    await this.dataSource.query(
      `INSERT INTO shipments
         (id, tenant_id, policy_id, provider, tracking_number,
          status, estimated_delivery_date, delivery_address)
       VALUES
         (gen_random_uuid(), $1, $2, 'speedy', 'SP123456789BG',
          'dispatched', CURRENT_DATE + INTERVAL '3 days',
          '{"city": "София", "street": "ул. Витоша 1", "postCode": "1000"}')
       ON CONFLICT DO NOTHING`,
      [DEMO_TENANT_ID, policy[0].id],
    );
    this.logger.log('Demo shipment seeded.');
  }

  // ─── Premium Broker Tenant ─────────────────────────────────────────────────

  private async seedPremiumTenant(): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO tenants (id, slug, name, status, plan, features, monthly_fee, activated_at)
       VALUES ($1, 'premium', 'Premium Broker', 'active', 'professional',
         '{"sticker_delivery": true, "dkp": true, "renewal_sms": true, "renewal_push": true, "fleet": true}',
         199.00, NOW() - INTERVAL '6 months')`,
      [PREMIUM_TENANT_ID],
    );
  }

  private async seedPremiumTenantConfig(): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO tenant_configs (id, tenant_id, primary_color, secondary_color, support_email, support_phone, subscription_tier)
       VALUES (gen_random_uuid(), $1, '#0D9488', '#4B5563', 'support@premium.bg', '+359 2 111 1111', 'professional')`,
      [PREMIUM_TENANT_ID],
    );
  }

  private async seedPremiumUsers(): Promise<void> {
    const adminHash = await bcrypt.hash('Admin1234!', 12);
    const agentHash = await bcrypt.hash('Agent1234!', 12);

    await this.dataSource.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, two_fa_enabled)
       VALUES (gen_random_uuid(), $1, 'admin@premium.bg', $2, 'broker_admin', false)
       ON CONFLICT DO NOTHING`,
      [PREMIUM_TENANT_ID, adminHash],
    );

    await this.dataSource.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, two_fa_enabled)
       VALUES (gen_random_uuid(), $1, 'agent@premium.bg', $2, 'broker_agent', false)
       ON CONFLICT DO NOTHING`,
      [PREMIUM_TENANT_ID, agentHash],
    );
  }

  private async seedPremiumClientsAndVehicles(): Promise<{
    clientAId: string;
    clientBId: string;
    vehicleAId: string;
    vehicleBId: string;
  }> {
    const clientA = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO end_clients (id, tenant_id, phone_number, phone_verified, first_name, last_name, email)
       VALUES (gen_random_uuid(), $1, '+359882345678', true, 'Мария', 'Петрова', 'maria.petrova@example.com')
       RETURNING id`,
      [PREMIUM_TENANT_ID],
    );

    const clientB = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO end_clients (id, tenant_id, phone_number, phone_verified, first_name, last_name, email)
       VALUES (gen_random_uuid(), $1, '+359883456789', true, 'Георги', 'Стоянов', 'georgi.stoyanov@example.com')
       RETURNING id`,
      [PREMIUM_TENANT_ID],
    );

    const vehicleA = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO vehicles
         (id, tenant_id, owner_id, vin, license_plate, make, model, year, color, engine_volume, fuel_type, first_registration_date)
       VALUES
         (gen_random_uuid(), $1, $2, 'JTDKB20U903123456', 'CB5678МК', 'Toyota', 'Corolla', 2021, 'Бял', '1.8', 'Хибрид', '2021-06-10')
       RETURNING id`,
      [PREMIUM_TENANT_ID, clientA[0].id],
    );

    const vehicleB = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO vehicles
         (id, tenant_id, owner_id, vin, license_plate, make, model, year, color, engine_volume, fuel_type, first_registration_date)
       VALUES
         (gen_random_uuid(), $1, $2, '2HGFB2F58DH123789', 'PB2233НА', 'Honda', 'Civic', 2020, 'Сив', '1.5', 'Бензин', '2020-03-22')
       RETURNING id`,
      [PREMIUM_TENANT_ID, clientB[0].id],
    );

    return {
      clientAId: clientA[0].id,
      clientBId: clientB[0].id,
      vehicleAId: vehicleA[0].id,
      vehicleBId: vehicleB[0].id,
    };
  }

  private async seedPremiumPolicies(
    clientAId: string,
    clientBId: string,
    vehicleAId: string,
    vehicleBId: string,
  ): Promise<void> {
    const insurers = await this.dataSource.query<
      { id: string; code: string }[]
    >(
      `SELECT id, code FROM insurers WHERE code IN ('generali', 'dsk', 'bulstrad') AND deleted_at IS NULL`,
    );
    if (insurers.length === 0) return;

    const byCode = Object.fromEntries(insurers.map((i) => [i.code, i.id]));
    const generaliId = byCode['generali'] ?? insurers[0].id;
    const dskId = byCode['dsk'] ?? insurers[0].id;
    const bulstradId = byCode['bulstrad'] ?? insurers[0].id;

    const policies: {
      num: string;
      insurerId: string;
      clientId: string;
      vehicleId: string;
      status: string;
      premium: number;
      piId: string;
      startOffset: number;
      endOffset: number;
    }[] = [
      {
        num: 'PREM-001',
        insurerId: generaliId,
        clientId: clientAId,
        vehicleId: vehicleAId,
        status: 'active',
        premium: 520.0,
        piId: 'pi_prem_001',
        startOffset: -60,
        endOffset: 305,
      },
      {
        num: 'PREM-002',
        insurerId: dskId,
        clientId: clientBId,
        vehicleId: vehicleBId,
        status: 'active',
        premium: 390.0,
        piId: 'pi_prem_002',
        startOffset: -30,
        endOffset: 335,
      },
      {
        num: 'PREM-003',
        insurerId: bulstradId,
        clientId: clientAId,
        vehicleId: vehicleAId,
        status: 'active',
        premium: 610.0,
        piId: 'pi_prem_003',
        startOffset: -10,
        endOffset: 355,
      },
      {
        num: 'PREM-004',
        insurerId: generaliId,
        clientId: clientBId,
        vehicleId: vehicleBId,
        status: 'expired',
        premium: 480.0,
        piId: 'pi_prem_004',
        startOffset: -400,
        endOffset: -35,
      },
      {
        num: 'PREM-005',
        insurerId: dskId,
        clientId: clientAId,
        vehicleId: vehicleAId,
        status: 'expired',
        premium: 355.0,
        piId: 'pi_prem_005',
        startOffset: -380,
        endOffset: -15,
      },
      {
        num: 'PREM-006',
        insurerId: bulstradId,
        clientId: clientBId,
        vehicleId: vehicleBId,
        status: 'cancelled',
        premium: 290.0,
        piId: 'pi_prem_006',
        startOffset: -200,
        endOffset: 165,
      },
    ];

    for (const p of policies) {
      const commission = +(p.premium * 0.045).toFixed(2);
      await this.dataSource.query(
        `INSERT INTO policies
           (id, tenant_id, payment_id, quote_id, insurer_id, policy_number, status,
            stripe_payment_intent_id, premium_amount, commission_amount, commission_pct,
            currency, end_client_id, vehicle_id, coverage_start_date, coverage_end_date,
            metadata, created_at)
         VALUES
           (gen_random_uuid(), $1,
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            $2, $3, $4, $5, $6, $7, 0.045, 'BGN', $8, $9,
            CURRENT_DATE + ($10 * INTERVAL '1 day'),
            CURRENT_DATE + ($11 * INTERVAL '1 day'),
            '{"source":"seed","has_full_owner_and_vehicle":true}',
            NOW() - ($12 * INTERVAL '1 day'))
         ON CONFLICT (policy_number) DO NOTHING`,
        [
          PREMIUM_TENANT_ID,
          p.insurerId,
          p.num,
          p.status,
          p.piId,
          p.premium,
          commission,
          p.clientId,
          p.vehicleId,
          p.startOffset,
          p.endOffset,
          Math.abs(p.startOffset),
        ],
      );
    }
    this.logger.log(
      'Premium policies seeded (3 active, 2 expired, 1 cancelled).',
    );
  }

  private async seedPremiumInvoices(): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO invoices
         (id, tenant_id, period_start, period_end, policies_count, total_premium,
          platform_fee, subscription_fee, amount_due, is_pro_rata, status)
       VALUES
         (gen_random_uuid(), $1,
          date_trunc('month', NOW() - INTERVAL '2 months')::date,
          (date_trunc('month', NOW() - INTERVAL '1 month') - INTERVAL '1 day')::date,
          12, 5850.00, 292.50, 199.00, 491.50, false, 'paid'),
         (gen_random_uuid(), $1,
          date_trunc('month', NOW() - INTERVAL '1 month')::date,
          (date_trunc('month', NOW()) - INTERVAL '1 day')::date,
          18, 8640.00, 432.00, 199.00, 631.00, false, 'paid'),
         (gen_random_uuid(), $1,
          date_trunc('month', NOW())::date,
          (date_trunc('month', NOW() + INTERVAL '1 month') - INTERVAL '1 day')::date,
          6, 1820.00, 91.00, 199.00, 290.00, false, 'pending')
       ON CONFLICT DO NOTHING`,
      [PREMIUM_TENANT_ID],
    );
    this.logger.log('Premium invoices seeded (2 paid, 1 open).');
  }

  private async seedPremiumCommissions(): Promise<void> {
    const insurer = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM insurers WHERE code = 'generali' AND deleted_at IS NULL LIMIT 1`,
    );
    if (insurer.length === 0) return;

    await this.dataSource.query(
      `INSERT INTO pending_commission_events
         (id, tenant_id, payment_id, insurer_id, product_type,
          premium_amount, commission_pct, commission_amount, status)
       VALUES
         (gen_random_uuid(), $1, '00000000-0000-0000-0000-000000000001', $2, 'GO', 520.00, 0.045, 23.40, 'pending'),
         (gen_random_uuid(), $1, '00000000-0000-0000-0000-000000000001', $2, 'GO', 390.00, 0.045, 17.55, 'pending')
       ON CONFLICT DO NOTHING`,
      [PREMIUM_TENANT_ID, insurer[0].id],
    );
    this.logger.log('Premium commission events seeded.');
  }
}
