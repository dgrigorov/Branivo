/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { UsersRepository } from './users.repository';
import { User } from './entities/user.entity';
import { IsNull } from 'typeorm';

const mockUser: User = {
  id: 'user-uuid',
  tenantId: 'tenant-uuid',
  email: 'broker@example.com',
  passwordHash: 'hashed',
  role: 'broker_admin',
  twoFaEnabled: false,
  twoFaSecretEnc: null,
  failedLoginCount: 0,
  lockedUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('UsersRepository', () => {
  let repo: UsersRepository;
  let typeOrmRepo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const typeOrmMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      increment: jest.fn(),
      update: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      manager: { query: jest.fn() },
    };

    const tenantContextMock = {
      getTenantId: jest.fn().mockReturnValue('tenant-uuid'),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersRepository,
        { provide: getRepositoryToken(User), useValue: typeOrmMock },
        { provide: TenantContext, useValue: tenantContextMock },
      ],
    }).compile();

    repo = module.get(UsersRepository);
    typeOrmRepo = module.get(getRepositoryToken(User));
  });

  describe('findByEmailAndTenant', () => {
    it('returns active user by email and tenantId', async () => {
      typeOrmRepo.findOne.mockResolvedValue(mockUser);

      const result = await repo.findByEmailAndTenant(
        'broker@example.com',
        'tenant-uuid',
      );

      expect(typeOrmRepo.findOne).toHaveBeenCalledWith({
        where: {
          email: 'broker@example.com',
          tenantId: 'tenant-uuid',
          deletedAt: expect.anything(),
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('returns null for soft-deleted user', async () => {
      typeOrmRepo.findOne.mockResolvedValue(null);

      const result = await repo.findByEmailAndTenant(
        'deleted@example.com',
        'tenant-uuid',
      );

      expect(result).toBeNull();
    });
  });

  describe('incrementFailedLoginCount', () => {
    it('increments failedLoginCount by 1', async () => {
      typeOrmRepo.increment.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await repo.incrementFailedLoginCount('user-uuid');

      expect(typeOrmRepo.increment).toHaveBeenCalledWith(
        { id: 'user-uuid' },
        'failedLoginCount',
        1,
      );
    });
  });

  describe('resetFailedLoginCount', () => {
    it('resets failedLoginCount and lockedUntil', async () => {
      typeOrmRepo.update.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await repo.resetFailedLoginCount('user-uuid');

      expect(typeOrmRepo.update).toHaveBeenCalledWith('user-uuid', {
        failedLoginCount: 0,
        lockedUntil: null,
      });
    });
  });

  describe('lockUser', () => {
    it('sets lockedUntil to provided date', async () => {
      typeOrmRepo.update.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      const lockDate = new Date(Date.now() + 900_000);

      await repo.lockUser('user-uuid', lockDate);

      expect(typeOrmRepo.update).toHaveBeenCalledWith('user-uuid', {
        lockedUntil: lockDate,
      });
    });
  });

  describe('findByIdAndTenant', () => {
    it('returns user by id and tenant', async () => {
      typeOrmRepo.findOne.mockResolvedValue(mockUser);

      const result = await repo.findByIdAndTenant('user-uuid', 'tenant-uuid');

      expect(result).toEqual(mockUser);
    });

    it('returns null for soft-deleted user', async () => {
      typeOrmRepo.findOne.mockResolvedValue(null);

      const result = await repo.findByIdAndTenant('user-uuid', 'tenant-uuid');

      expect(result).toBeNull();
    });
  });

  describe('incrementAndMaybeLock', () => {
    it('returns incremented count without lock when below threshold', async () => {
      (typeOrmRepo.manager.query as jest.Mock).mockResolvedValue([
        { failed_login_count: 3, locked_until: null },
      ]);

      const result = await repo.incrementAndMaybeLock('user-uuid', 5, 900);

      expect(result).toEqual({ failedLoginCount: 3, lockedUntil: null });
      expect(typeOrmRepo.manager.query as jest.Mock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        [5, 900, 'user-uuid'],
      );
    });

    it('returns lockedUntil when threshold reached (atomic lock)', async () => {
      const lockDate = new Date(Date.now() + 900_000).toISOString();
      (typeOrmRepo.manager.query as jest.Mock).mockResolvedValue([
        { failed_login_count: 5, locked_until: lockDate },
      ]);

      const result = await repo.incrementAndMaybeLock('user-uuid', 5, 900);

      expect(result.failedLoginCount).toBe(5);
      expect(result.lockedUntil).toBeInstanceOf(Date);
    });
  });

  describe('findAllByTenant (RLS enforcement)', () => {
    it('calls setTenantSession before querying — sets app.current_tenant_id', async () => {
      typeOrmRepo.query.mockResolvedValue([]);
      typeOrmRepo.find.mockResolvedValue([mockUser]);

      const result = await repo.findAllByTenant();

      // setTenantSession calls repo.query: SELECT set_config('app.current_tenant_id', $1, true)
      expect(typeOrmRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        ['tenant-uuid'],
      );
      expect(result).toEqual([mockUser]);
    });
  });

  describe('updateRole', () => {
    it('calls setTenantSession then updates role', async () => {
      typeOrmRepo.query.mockResolvedValue([]);
      typeOrmRepo.update.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await repo.updateRole('user-uuid', 'broker_viewer');

      expect(typeOrmRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        ['tenant-uuid'],
      );
      expect(typeOrmRepo.update).toHaveBeenCalledWith(
        { id: 'user-uuid', tenantId: 'tenant-uuid', deletedAt: IsNull() },
        { role: 'broker_viewer' },
      );
    });
  });

  describe('softDelete (override)', () => {
    it('calls setTenantSession then soft-deletes with explicit tenantId', async () => {
      typeOrmRepo.query.mockResolvedValue([]);
      typeOrmRepo.update.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await repo.softDelete('user-uuid');

      expect(typeOrmRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        ['tenant-uuid'],
      );
      expect(typeOrmRepo.update).toHaveBeenCalledWith(
        { id: 'user-uuid', tenantId: 'tenant-uuid', deletedAt: IsNull() },
        { deletedAt: expect.any(Date) },
      );
    });
  });

  describe('createUser', () => {
    it('calls setTenantSession via BaseRepository.save', async () => {
      typeOrmRepo.query.mockResolvedValue([]);
      typeOrmRepo.save.mockResolvedValue(mockUser);

      await repo.createUser({ email: 'new@example.com', role: 'broker_agent' });

      expect(typeOrmRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('set_config'),
        ['tenant-uuid'],
      );
    });
  });
});
