import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AdminTenantsService } from './admin-tenants.service';
import { TenantsRepository } from '../tenants/tenants.repository';
import { TenantInvitationsRepository } from './repositories/tenant-invitations.repository';
import { CryptoService } from '../../common/crypto/crypto.service';
import { EmailService } from '../../common/email/email.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantInvitation } from './entities/tenant-invitation.entity';

// Mock otplib
jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('MOCKSECRET'),
  generateURI: jest
    .fn()
    .mockReturnValue('otpauth://totp/Branivo:test@test.com?secret=MOCKSECRET'),
  verifySync: jest.fn().mockReturnValue({ valid: true }),
}));

// Mock Stripe to avoid needing API keys in tests
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    accounts: {
      create: jest.fn().mockResolvedValue({ id: 'acct_test' }),
    },
    accountLinks: {
      create: jest
        .fn()
        .mockResolvedValue({ url: 'https://stripe.com/connect' }),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

const makeTenant = (overrides: Partial<Tenant> = {}): Tenant =>
  Object.assign(new Tenant(), {
    id: 'tenant-uuid',
    name: 'Test Broker',
    slug: 'test-broker',
    status: 'invited',
    plan: 'starter',
    features: {},
    stripeAccountId: null,
    kfnLicense: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

const makeInvitation = (
  overrides: Partial<TenantInvitation> = {},
): TenantInvitation =>
  Object.assign(new TenantInvitation(), {
    id: 'invite-uuid',
    tenantId: 'tenant-uuid',
    email: 'broker@example.com',
    token: 'some-jwt-token',
    status: 'pending',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

describe('AdminTenantsService', () => {
  let service: AdminTenantsService;

  const tenantsRepo = {
    findBySlug: jest.fn(),
    createTenant: jest.fn(),
    findById: jest.fn(),
    findAllForAdmin: jest.fn(),
    updateStatus: jest.fn(),
    updateStripeAccount: jest.fn(),
    activateTenant: jest.fn(),
    findByStripeAccountId: jest.fn(),
  };

  const invitationsRepo = {
    create: jest.fn(),
    findByToken: jest.fn(),
    findPendingByEmail: jest.fn(),
    findByTenantId: jest.fn(),
    markAsUsed: jest.fn(),
  };

  const jwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn(),
  };

  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-secret'),
    get: jest.fn().mockReturnValue('https://onboarding.branivo.bg'),
  };

  const emailService = {
    sendOnboardingInvite: jest.fn().mockResolvedValue(undefined),
  };

  const cryptoService = {
    encrypt: jest.fn().mockReturnValue('encrypted-secret'),
    decrypt: jest.fn(),
  };

  const managerQueryMock = jest.fn().mockResolvedValue(undefined);
  const dataSource = {
    query: jest.fn().mockResolvedValue([{ id: 'new-user-uuid' }]),
    transaction: jest
      .fn()
      .mockImplementation(
        async (fn: (manager: { query: jest.Mock }) => Promise<void>) => {
          return fn({ query: managerQueryMock });
        },
      ),
  };

  const redisMock = {
    exists: jest.fn().mockResolvedValue(0),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        AdminTenantsService,
        { provide: TenantsRepository, useValue: tenantsRepo },
        { provide: TenantInvitationsRepository, useValue: invitationsRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: EmailService, useValue: emailService },
        { provide: CryptoService, useValue: cryptoService },
        { provide: DataSource, useValue: dataSource },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get(AdminTenantsService);
  });

  describe('inviteTenant', () => {
    it('creates tenant, invitation, sends email and returns tenantId', async () => {
      const tenant = makeTenant();
      tenantsRepo.findBySlug.mockResolvedValue(null);
      tenantsRepo.createTenant.mockResolvedValue(tenant);
      invitationsRepo.create.mockResolvedValue(makeInvitation());

      const result = await service.inviteTenant(
        {
          name: 'Test Broker',
          slug: 'test-broker',
          email: 'broker@example.com',
        },
        'super-admin-uuid',
      );

      expect(tenantsRepo.createTenant).toHaveBeenCalledWith({
        name: 'Test Broker',
        slug: 'test-broker',
        status: 'invited',
      });
      expect(emailService.sendOnboardingInvite).toHaveBeenCalledWith(
        'broker@example.com',
        'mock-jwt-token',
        'Test Broker',
      );
      expect(result.tenantId).toBe('tenant-uuid');
      expect(result.message).toBe('Invitation sent');
    });

    it('throws ConflictException when slug already taken', async () => {
      tenantsRepo.findBySlug.mockResolvedValue(makeTenant());

      await expect(
        service.inviteTenant(
          { name: 'Test', slug: 'test-broker', email: 'x@x.com' },
          'super-uuid',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getOnboardingStatus', () => {
    it('returns tenant info for valid token', async () => {
      const tenant = makeTenant();
      const invitation = makeInvitation();

      jwtService.verify.mockReturnValue({
        sub: 'tenant-uuid',
        email: 'broker@example.com',
        type: 'onboarding',
      });
      invitationsRepo.findByToken.mockResolvedValue(invitation);
      tenantsRepo.findById.mockResolvedValue(tenant);

      const result = await service.getOnboardingStatus('valid-token');

      expect(result.tenantId).toBe('tenant-uuid');
      expect(result.tenantName).toBe('Test Broker');
      expect(result.tenantStatus).toBe('invited');
    });

    it('throws NotFoundException for expired/invalid token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        service.getOnboardingStatus('expired-token'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when invitation not found (used token)', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'tenant-uuid',
        email: 'b@b.com',
        type: 'onboarding',
      });
      invitationsRepo.findByToken.mockResolvedValue(null);

      await expect(service.getOnboardingStatus('used-token')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('handleStripeAccountUpdated', () => {
    const makeEvent = (chargesEnabled: boolean, tenantId?: string) => ({
      id: 'evt_123',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test',
          charges_enabled: chargesEnabled,
          metadata: tenantId ? { tenant_id: tenantId } : {},
        },
      },
    });

    it('updates status to stripe_connected when charges_enabled is true', async () => {
      const tenant = makeTenant({ status: 'invited' });
      tenantsRepo.findById.mockResolvedValue(tenant);

      await service.handleStripeAccountUpdated(
        makeEvent(true, 'tenant-uuid') as never,
      );

      expect(tenantsRepo.updateStripeAccount).toHaveBeenCalledWith(
        'tenant-uuid',
        'acct_test',
      );
      expect(tenantsRepo.updateStatus).toHaveBeenCalledWith(
        'tenant-uuid',
        'stripe_connected',
      );
    });

    it('does NOT update when charges_enabled is false', async () => {
      await service.handleStripeAccountUpdated(
        makeEvent(false, 'tenant-uuid') as never,
      );

      expect(tenantsRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('skips when already stripe_connected (idempotency)', async () => {
      const tenant = makeTenant({ status: 'stripe_connected' });
      tenantsRepo.findById.mockResolvedValue(tenant);

      await service.handleStripeAccountUpdated(
        makeEvent(true, 'tenant-uuid') as never,
      );

      expect(tenantsRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('skips duplicate webhook via Redis idempotency key', async () => {
      redisMock.exists.mockResolvedValueOnce(1);

      await service.handleStripeAccountUpdated(
        makeEvent(true, 'tenant-uuid') as never,
      );

      expect(tenantsRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('verifyKfnAndActivate', () => {
    it('throws BadRequestException when status is not stripe_connected', async () => {
      tenantsRepo.findById.mockResolvedValue(makeTenant({ status: 'invited' }));

      await expect(
        service.verifyKfnAndActivate('tenant-uuid', '12345', 'super-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('activates tenant and provisions Redis subdomain on success', async () => {
      const tenant = makeTenant({
        status: 'stripe_connected',
        slug: 'test-broker',
      });
      tenantsRepo.findById.mockResolvedValue(tenant);
      invitationsRepo.findByTenantId.mockResolvedValue(makeInvitation());

      await service.verifyKfnAndActivate('tenant-uuid', '12345', null);

      expect(tenantsRepo.activateTenant).toHaveBeenCalledWith(
        'tenant-uuid',
        '12345',
      );
      expect(redisMock.set).toHaveBeenCalledWith(
        '_system:host:test-broker.branivo.bg',
        'tenant-uuid',
        'EX',
        300,
      );
      expect(invitationsRepo.markAsUsed).toHaveBeenCalledWith('invite-uuid');
    });
  });

  describe('createBrokerAdminUser', () => {
    it('creates user with bcrypt hash and encrypted TOTP secret', async () => {
      const tenant = makeTenant({ status: 'active' });
      tenantsRepo.findById.mockResolvedValue(tenant);
      invitationsRepo.findByTenantId.mockResolvedValue(makeInvitation());

      const result = await service.createBrokerAdminUser('tenant-uuid', {
        password: 'ValidPass1!',
      });

      expect(dataSource.query).toHaveBeenCalled();
      expect(cryptoService.encrypt).toHaveBeenCalled();
      expect(result.otpauthUrl).toContain('otpauth://');
      expect(result.userId).toBe('new-user-uuid');
    });

    it('throws BadRequestException when tenant is not active', async () => {
      tenantsRepo.findById.mockResolvedValue(
        makeTenant({ status: 'stripe_connected' }),
      );

      await expect(
        service.createBrokerAdminUser('tenant-uuid', {
          password: 'ValidPass1!',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateTenantStatus', () => {
    it('deactivates active tenant: updates status, invalidates Redis cache, writes audit log', async () => {
      tenantsRepo.findById.mockResolvedValue(makeTenant({ status: 'active' }));

      await service.updateTenantStatus(
        'tenant-uuid',
        'suspended',
        'super-uuid',
      );

      expect(tenantsRepo.updateStatus).toHaveBeenCalledWith(
        'tenant-uuid',
        'suspended',
      );
      expect(redisMock.del).toHaveBeenCalledWith(
        expect.stringContaining('tenant-uuid'),
      );
      expect(managerQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining([
          'tenant-uuid',
          'super-uuid',
          'tenant.deactivated',
        ]),
      );
    });

    it('reactivates suspended tenant: updates status and writes audit log tenant.reactivated', async () => {
      tenantsRepo.findById.mockResolvedValue(
        makeTenant({ status: 'suspended' }),
      );

      await service.updateTenantStatus('tenant-uuid', 'active', 'super-uuid');

      expect(tenantsRepo.updateStatus).toHaveBeenCalledWith(
        'tenant-uuid',
        'active',
      );
      expect(managerQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining([
          'tenant-uuid',
          'super-uuid',
          'tenant.reactivated',
        ]),
      );
    });

    it('throws BadRequestException for invalid transition invited → suspended', async () => {
      tenantsRepo.findById.mockResolvedValue(makeTenant({ status: 'invited' }));

      await expect(
        service.updateTenantStatus('tenant-uuid', 'suspended', 'super-uuid'),
      ).rejects.toThrow(BadRequestException);
      expect(tenantsRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid transition active → active', async () => {
      tenantsRepo.findById.mockResolvedValue(makeTenant({ status: 'active' }));

      await expect(
        service.updateTenantStatus('tenant-uuid', 'active', 'super-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for non-existent tenant', async () => {
      tenantsRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateTenantStatus(
          'non-existent-uuid',
          'suspended',
          'super-uuid',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('audit log', () => {
    it('records audit_log entry on tenant.invited', async () => {
      const tenant = makeTenant();
      tenantsRepo.findBySlug.mockResolvedValue(null);
      tenantsRepo.createTenant.mockResolvedValue(tenant);
      invitationsRepo.create.mockResolvedValue(makeInvitation());

      await service.inviteTenant(
        { name: 'Test', slug: 'test-broker', email: 'b@b.com' },
        'super-uuid',
      );

      expect(managerQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining(['tenant-uuid', 'super-uuid', 'tenant.invited']),
      );
    });

    it('records audit_log entry on tenant.activated', async () => {
      const tenant = makeTenant({ status: 'stripe_connected', slug: 'test' });
      tenantsRepo.findById.mockResolvedValue(tenant);
      invitationsRepo.findByTenantId.mockResolvedValue(makeInvitation());

      await service.verifyKfnAndActivate('tenant-uuid', '12345', null);

      expect(managerQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        expect.arrayContaining(['tenant-uuid', null, 'tenant.activated']),
      );
    });
  });
});
