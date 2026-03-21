import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PolicyEventsRepository } from './policy-events.repository';
import { PolicyEvent, PolicyEventType } from './entities/policy-event.entity';

const POLICY_ID = 'policy-uuid-111';
const TENANT_ID = 'tenant-uuid-222';

const mockTypeormRepo = {
  create: jest.fn(),
  save: jest.fn(),
};

describe('PolicyEventsRepository', () => {
  let repo: PolicyEventsRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyEventsRepository,
        {
          provide: getRepositoryToken(PolicyEvent),
          useValue: mockTypeormRepo,
        },
      ],
    }).compile();

    repo = module.get<PolicyEventsRepository>(PolicyEventsRepository);
  });

  describe('createEvent', () => {
    it('creates and saves event — only INSERT (no update/delete)', async () => {
      const eventData = {
        tenantId: TENANT_ID,
        policyId: POLICY_ID,
        eventType: PolicyEventType.ACTIVATED,
        payload: { stripePaymentIntentId: 'pi_test' },
        stripeEventId: 'evt_test_001',
      };
      const createdEvent = {
        ...eventData,
        createdBy: 'system',
        id: 'evt-uuid',
      };
      mockTypeormRepo.create.mockReturnValue(createdEvent);
      mockTypeormRepo.save.mockResolvedValue(createdEvent);

      const result = await repo.createEvent(eventData);

      expect(mockTypeormRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...eventData,
          createdBy: 'system',
        }),
      );
      expect(mockTypeormRepo.save).toHaveBeenCalledWith(createdEvent);
      expect(result).toBe(createdEvent);
    });

    it('sets createdBy to "system" always', async () => {
      const eventData = {
        tenantId: TENANT_ID,
        policyId: POLICY_ID,
        eventType: PolicyEventType.PDF_QUEUED,
        payload: {},
      };
      const createdEvent = { ...eventData, createdBy: 'system' };
      mockTypeormRepo.create.mockReturnValue(createdEvent);
      mockTypeormRepo.save.mockResolvedValue(createdEvent);

      await repo.createEvent(eventData);

      const createArg = (
        mockTypeormRepo.create.mock.calls as Array<[{ createdBy: string }]>
      )[0][0];
      expect(createArg.createdBy).toBe('system');
    });

    it('repository has no update or delete methods', () => {
      // Verifies immutability constraint
      expect(repo).not.toHaveProperty('update');
      expect(repo).not.toHaveProperty('delete');
      expect(repo).not.toHaveProperty('softDelete');
    });
  });
});
