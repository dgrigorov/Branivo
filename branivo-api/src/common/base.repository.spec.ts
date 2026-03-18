/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { IsNull, Repository } from 'typeorm';
import { BaseRepository } from './base.repository';
import { TenantContext } from './tenant-context/tenant.context';

interface TestEntity {
  id: string;
  deletedAt: Date | null;
}

class TestRepository extends BaseRepository<TestEntity> {
  constructor(repo: Repository<TestEntity>, tenantContext: TenantContext) {
    super(repo, tenantContext);
  }
}

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockRepo = {
  query: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  save: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
} as unknown as TenantContext;

describe('BaseRepository', () => {
  let repository: TestRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new TestRepository(
      mockRepo as unknown as Repository<TestEntity>,
      mockTenantContext,
    );
  });

  describe('setTenantSession', () => {
    it('calls set_config with the correct tenant_id before findAll', async () => {
      mockRepo.query.mockResolvedValueOnce([]);
      mockRepo.find.mockResolvedValueOnce([]);

      await repository.findAll({});

      expect(mockRepo.query).toHaveBeenCalledWith(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        [TENANT_ID],
      );
    });

    it('calls set_config before findOne', async () => {
      mockRepo.query.mockResolvedValueOnce([]);
      mockRepo.findOne.mockResolvedValueOnce(null);

      await repository.findOne({});

      expect(mockRepo.query).toHaveBeenCalledWith(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        [TENANT_ID],
      );
    });

    it('calls set_config before softDelete', async () => {
      mockRepo.query.mockResolvedValueOnce([]);
      mockRepo.update.mockResolvedValueOnce({ affected: 1 });

      await repository.softDelete('some-id');

      expect(mockRepo.query).toHaveBeenCalledWith(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        [TENANT_ID],
      );
    });
  });

  describe('findAll', () => {
    it('always appends deletedAt: IsNull() to where clause', async () => {
      mockRepo.query.mockResolvedValueOnce([]);
      mockRepo.find.mockResolvedValueOnce([]);

      await repository.findAll({ id: 'test-id' } as any);

      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { id: 'test-id', deletedAt: IsNull() },
      });
    });
  });

  describe('save', () => {
    it('calls set_config before save', async () => {
      mockRepo.query.mockResolvedValueOnce([]);
      mockRepo.save.mockResolvedValueOnce({ id: 'new-id', deletedAt: null });

      await repository.save({ id: 'new-id', deletedAt: null });

      expect(mockRepo.query).toHaveBeenCalledWith(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        [TENANT_ID],
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt to current date rather than hard-deleting', async () => {
      mockRepo.query.mockResolvedValueOnce([]);
      mockRepo.update.mockResolvedValueOnce({ affected: 1 });

      const before = new Date();
      await repository.softDelete('test-id');
      const after = new Date();

      const updateArg = (mockRepo.update.mock.calls[0] as unknown[])[1] as {
        deletedAt: Date;
      };
      expect(updateArg.deletedAt).toBeInstanceOf(Date);
      expect(updateArg.deletedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(updateArg.deletedAt.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      );
    });
  });
});
