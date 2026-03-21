import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PoliciesRepository } from './policies.repository';
import { Policy, PolicyStatus } from './entities/policy.entity';
import { TenantContext } from '../../common/tenant-context/tenant.context';

const POLICY_ID = 'policy-uuid-111';
const TENANT_ID = 'tenant-uuid-222';
const INTENT_ID = 'pi_test_intent_001';

const mockQueryFn = jest.fn().mockResolvedValue(undefined);

const mockTypeormRepo = {
  findOne: jest.fn(),
  update: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  query: mockQueryFn,
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

describe('PoliciesRepository', () => {
  let repo: PoliciesRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTypeormRepo.query.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoliciesRepository,
        { provide: getRepositoryToken(Policy), useValue: mockTypeormRepo },
        { provide: TenantContext, useValue: mockTenantContext },
      ],
    }).compile();

    repo = module.get<PoliciesRepository>(PoliciesRepository);
  });

  describe('findByStripeIntentId', () => {
    it('queries without tenant scope (webhook context)', async () => {
      const policy = { id: POLICY_ID, status: PolicyStatus.ACTIVE };
      mockTypeormRepo.findOne.mockResolvedValue(policy);

      const result = await repo.findByStripeIntentId(INTENT_ID);

      expect(result).toBe(policy);
      expect(mockTypeormRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stripePaymentIntentId: INTENT_ID,
          }) as { stripePaymentIntentId: string },
        }) as { where: { stripePaymentIntentId: string } },
      );
      // НЕ трябва да вика setTenantSession (query за tenant)
      expect(mockTypeormRepo.query).not.toHaveBeenCalled();
    });

    it('returns null when not found', async () => {
      mockTypeormRepo.findOne.mockResolvedValue(null);

      const result = await repo.findByStripeIntentId('not_existing');

      expect(result).toBeNull();
    });
  });

  describe('findByIdForTenant', () => {
    it('sets tenant session before querying', async () => {
      const policy = { id: POLICY_ID, status: PolicyStatus.ACTIVE };
      mockTypeormRepo.findOne.mockResolvedValue(policy);

      const result = await repo.findByIdForTenant(POLICY_ID);

      expect(result).toBe(policy);
      // setTenantSession викa repo.query
      expect(mockTypeormRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        [TENANT_ID],
      );
    });
  });

  describe('activatePolicy', () => {
    it('updates only status — commission columns NOT touched', async () => {
      mockTypeormRepo.update.mockResolvedValue({ affected: 1 });

      await repo.activatePolicy(POLICY_ID);

      expect(mockTypeormRepo.update).toHaveBeenCalledWith(
        POLICY_ID,
        expect.objectContaining({ status: PolicyStatus.ACTIVE }),
      );
      const updateArg = (
        mockTypeormRepo.update.mock.calls as Array<[string, object]>
      )[0][1];
      expect(updateArg).not.toHaveProperty('commissionAmount');
      expect(updateArg).not.toHaveProperty('commissionPct');
    });
  });

  describe('markFailed', () => {
    it('updates status to FAILED', async () => {
      mockTypeormRepo.update.mockResolvedValue({ affected: 1 });

      await repo.markFailed(POLICY_ID);

      expect(mockTypeormRepo.update).toHaveBeenCalledWith(
        POLICY_ID,
        expect.objectContaining({ status: PolicyStatus.FAILED }),
      );
    });
  });

  describe('saveWithoutTenantScope', () => {
    it('saves entity bypassing setTenantSession — no query call', async () => {
      const policyData = {
        tenantId: TENANT_ID,
        stripePaymentIntentId: INTENT_ID,
        status: PolicyStatus.ACTIVE,
      };
      const savedPolicy = { id: POLICY_ID, ...policyData };
      mockTypeormRepo.save.mockResolvedValue(savedPolicy);

      const result = await repo.saveWithoutTenantScope(policyData);

      expect(result).toBe(savedPolicy);
      expect(mockTypeormRepo.save).toHaveBeenCalledWith(policyData);
      // Критично: НЕ трябва да вика setTenantSession (query) — webhook context без tenant
      expect(mockTypeormRepo.query).not.toHaveBeenCalled();
    });
  });
});
