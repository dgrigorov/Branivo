import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateURI } from 'otplib';
import Stripe from 'stripe';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';
import { CryptoService } from '../../common/crypto/crypto.service';
import { EmailService } from '../../common/email/email.service';
import { TenantsRepository } from '../tenants/tenants.repository';
import { TenantInvitationsRepository } from './repositories/tenant-invitations.repository';
import { InviteTenantDto } from './dto/invite-tenant.dto';
import { SetupBrokerDto } from './dto/setup-broker.dto';
import { OnboardingStatusResponseDto } from './dto/onboarding-status-response.dto';
import { Tenant } from '../tenants/entities/tenant.entity';

const ONBOARDING_TTL_SECONDS = 48 * 60 * 60; // 48 hours
const BCRYPT_COST = 12;
const KFN_LICENSE_REGEX = /^[0-9]{3,10}$/;
const REDIS_TTL_SUBDOMAIN = 300; // 5 min

interface OnboardingTokenPayload {
  sub: string;
  email: string;
  type: 'onboarding';
}

@Injectable()
export class AdminTenantsService {
  private readonly logger = new Logger(AdminTenantsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tenantsRepository: TenantsRepository,
    private readonly invitationsRepository: TenantInvitationsRepository,
    private readonly cryptoService: CryptoService,
    private readonly emailService: EmailService,
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.stripe = new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
      { apiVersion: '2026-02-25.clover' },
    );
  }

  async inviteTenant(
    dto: InviteTenantDto,
    superAdminId: string,
  ): Promise<{ tenantId: string; message: string }> {
    const existing = await this.tenantsRepository.findBySlug(dto.slug);
    if (existing) {
      throw new ConflictException(`Slug '${dto.slug}' is already taken`);
    }

    const tenant = await this.tenantsRepository.createTenant({
      name: dto.name,
      slug: dto.slug,
      status: 'invited',
    });

    const secret = this.config.getOrThrow<string>('ONBOARDING_JWT_SECRET');
    const token = this.jwtService.sign(
      { sub: tenant.id, email: dto.email, type: 'onboarding' },
      { secret, expiresIn: ONBOARDING_TTL_SECONDS },
    );

    await this.invitationsRepository.create({
      tenantId: tenant.id,
      email: dto.email,
      token,
      expiresAt: new Date(Date.now() + ONBOARDING_TTL_SECONDS * 1000),
    });

    await this.emailService.sendOnboardingInvite(dto.email, token, dto.name);

    await this.writeAuditLog({
      tenantId: tenant.id,
      userId: superAdminId,
      action: 'tenant.invited',
      entityType: 'tenant',
      entityId: tenant.id,
    });

    return { tenantId: tenant.id, message: 'Invitation sent' };
  }

  async getOnboardingStatus(
    token: string,
  ): Promise<OnboardingStatusResponseDto> {
    const payload = this.verifyOnboardingToken(token);

    const invitation = await this.invitationsRepository.findByToken(token);
    if (!invitation) {
      throw new NotFoundException('Invitation not found or expired');
    }

    const tenant = await this.tenantsRepository.findById(payload.sub);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      tenantId: tenant.id,
      email: invitation.email,
      tenantName: tenant.name,
      tenantStatus: tenant.status,
    };
  }

  async initiateStripeConnect(
    tenantId: string,
  ): Promise<{ onboardingUrl: string }> {
    const tenant = await this.findTenantOrThrow(tenantId);

    if (tenant.status !== 'invited') {
      throw new BadRequestException(
        `Cannot initiate Stripe Connect in status '${tenant.status}'`,
      );
    }

    const invitation =
      await this.invitationsRepository.findByTenantId(tenantId);

    const account = await this.stripe.accounts.create({
      type: 'express',
      country: 'BG',
      email: invitation?.email,
      metadata: { tenant_id: tenantId, slug: tenant.slug },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'https://onboarding.branivo.bg',
    );
    const invitationToken = invitation?.token ?? '';

    const accountLink = await this.stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${frontendUrl}/onboarding?token=${invitationToken}&stripe_retry=true`,
      return_url: `${frontendUrl}/onboarding?token=${invitationToken}&stripe_complete=true`,
      type: 'account_onboarding',
    });

    await this.tenantsRepository.updateStripeAccount(tenantId, account.id);

    return { onboardingUrl: accountLink.url };
  }

  async handleStripeAccountUpdated(event: Stripe.Event): Promise<void> {
    const processedKey = `_system:stripe:processed:${event.id}`;
    const alreadyProcessed = await this.redis.exists(processedKey);
    if (alreadyProcessed) return;
    await this.redis.set(processedKey, '1', 'EX', 86400);

    const account = event.data.object as Stripe.Account;
    if (!account.charges_enabled) return;

    const tenantId = account.metadata?.tenant_id;
    let tenant: Tenant | null = null;

    if (tenantId) {
      tenant = await this.tenantsRepository.findById(tenantId);
    } else {
      tenant = await this.tenantsRepository.findByStripeAccountId(account.id);
    }

    if (!tenant) {
      this.logger.warn(
        `Stripe account.updated: no tenant found for account ${account.id}`,
      );
      return;
    }

    if (tenant.status === 'stripe_connected') return;

    await this.tenantsRepository.updateStripeAccount(tenant.id, account.id);
    await this.tenantsRepository.updateStatus(tenant.id, 'stripe_connected');

    await this.writeAuditLog({
      tenantId: tenant.id,
      userId: null,
      action: 'tenant.stripe_connected',
      entityType: 'tenant',
      entityId: tenant.id,
    });
  }

  async verifyKfnAndActivate(
    tenantId: string,
    kfnLicense: string,
    superAdminId: string | null,
  ): Promise<void> {
    const tenant = await this.findTenantOrThrow(tenantId);

    if (tenant.status !== 'stripe_connected') {
      throw new BadRequestException('Stripe Connect not completed');
    }

    if (!KFN_LICENSE_REGEX.test(kfnLicense)) {
      throw new BadRequestException(
        'Invalid КФН license format (3–10 digits required)',
      );
    }

    await this.tenantsRepository.activateTenant(tenantId, kfnLicense);

    const redisKey = RedisKeyHelper.buildSystem(
      'host',
      `${tenant.slug}.branivo.bg`,
    );
    await this.redis.set(redisKey, tenantId, 'EX', REDIS_TTL_SUBDOMAIN);

    const invitation =
      await this.invitationsRepository.findByTenantId(tenantId);
    if (invitation) {
      await this.invitationsRepository.markAsUsed(invitation.id);
    }

    await this.writeAuditLog({
      tenantId,
      userId: superAdminId,
      action: 'tenant.activated',
      entityType: 'tenant',
      entityId: tenantId,
    });
  }

  async createBrokerAdminUser(
    tenantId: string,
    dto: SetupBrokerDto,
  ): Promise<{ userId: string; otpauthUrl: string }> {
    const tenant = await this.findTenantOrThrow(tenantId);

    if (tenant.status !== 'active') {
      throw new BadRequestException(
        'Tenant must be fully activated before creating broker admin user',
      );
    }

    const invitation =
      await this.invitationsRepository.findByTenantId(tenantId);
    const email = invitation?.email ?? `admin@${tenant.slug}.branivo.bg`;

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const plainSecret = generateSecret();
    const otpauthUrl = generateURI({
      label: email,
      secret: plainSecret,
      issuer: 'Branivo',
    });
    const encryptedSecret = this.cryptoService.encrypt(plainSecret);

    const result = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO users (tenant_id, email, password_hash, role, two_fa_enabled, two_fa_secret_enc, created_at, updated_at)
       VALUES ($1, $2, $3, 'broker_admin', true, $4, NOW(), NOW())
       RETURNING id`,
      [tenantId, email, passwordHash, encryptedSecret],
    );

    const userId = result[0].id;

    return { userId, otpauthUrl };
  }

  async updateTenantStatus(
    tenantId: string,
    newStatus: 'active' | 'suspended',
    superAdminId: string,
  ): Promise<void> {
    const tenant = await this.findTenantOrThrow(tenantId);

    const allowed: Record<string, string[]> = {
      active: ['suspended'],
      suspended: ['active'],
    };

    if (!allowed[tenant.status]?.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${tenant.status}' to '${newStatus}'`,
      );
    }

    await this.tenantsRepository.updateStatus(tenantId, newStatus);

    const cacheKey = RedisKeyHelper.build(tenantId, 'config', 'tenant');
    await this.redis.del(cacheKey);

    const action =
      newStatus === 'suspended' ? 'tenant.deactivated' : 'tenant.reactivated';

    await this.writeAuditLog({
      tenantId,
      userId: superAdminId,
      action,
      entityType: 'tenant',
      entityId: tenantId,
    });
  }

  async findAll(
    page: number,
    limit: number,
  ): Promise<{ data: Tenant[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.tenantsRepository.findAllForAdmin(
      page,
      limit,
    );
    return { data, total, page, limit };
  }

  async findOne(tenantId: string): Promise<Tenant> {
    return this.findTenantOrThrow(tenantId);
  }

  private async findTenantOrThrow(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantsRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
    return tenant;
  }

  private verifyOnboardingToken(token: string): OnboardingTokenPayload {
    try {
      const secret = this.config.getOrThrow<string>('ONBOARDING_JWT_SECRET');
      const payload = this.jwtService.verify<OnboardingTokenPayload>(token, {
        secret,
      });
      if (payload.type !== 'onboarding') {
        throw new Error('Invalid token type');
      }
      return payload;
    } catch {
      throw new NotFoundException('Invitation not found or expired');
    }
  }

  private async writeAuditLog(entry: {
    tenantId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
  }): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.query(`SET LOCAL app.current_tenant_id = $1`, [
          entry.tenantId,
        ]);
        await manager.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            entry.tenantId,
            entry.userId,
            entry.action,
            entry.entityType,
            entry.entityId,
          ],
        );
      });
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }
}
