/* eslint-disable @typescript-eslint/unbound-method */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantActiveGuard } from './tenant-active.guard';
import { TenantsRepository } from '../../modules/tenants/tenants.repository';
import { TenantContext } from '../tenant-context/tenant.context';

const TENANT_ID = 'tenant-uuid-001';

function makeContext(method: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method }),
    }),
  } as unknown as ExecutionContext;
}

describe('TenantActiveGuard', () => {
  let guard: TenantActiveGuard;
  let tenantsRepository: jest.Mocked<TenantsRepository>;
  let tenantContext: jest.Mocked<TenantContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantActiveGuard,
        {
          provide: TenantsRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: TenantContext,
          useValue: { getTenantId: jest.fn().mockReturnValue(TENANT_ID) },
        },
      ],
    }).compile();

    guard = module.get(TenantActiveGuard);
    tenantsRepository = module.get(TenantsRepository);
    tenantContext = module.get(TenantContext);
  });

  describe('GET / HEAD — always allowed', () => {
    it('allows GET regardless of tenant status', async () => {
      tenantsRepository.findById.mockResolvedValue({
        status: 'suspended',
      } as never);
      await expect(guard.canActivate(makeContext('GET'))).resolves.toBe(true);
      expect(tenantsRepository.findById).not.toHaveBeenCalled();
    });

    it('allows HEAD regardless of tenant status', async () => {
      await expect(guard.canActivate(makeContext('HEAD'))).resolves.toBe(true);
      expect(tenantsRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('POST — checks tenant status', () => {
    it('allows POST when tenant is active', async () => {
      tenantsRepository.findById.mockResolvedValue({
        status: 'active',
      } as never);
      await expect(guard.canActivate(makeContext('POST'))).resolves.toBe(true);
      expect(tenantContext.getTenantId).toHaveBeenCalled();
      expect(tenantsRepository.findById).toHaveBeenCalledWith(TENANT_ID);
    });

    it('throws ForbiddenException when tenant is suspended', async () => {
      tenantsRepository.findById.mockResolvedValue({
        status: 'suspended',
      } as never);
      await expect(guard.canActivate(makeContext('POST'))).rejects.toThrow(
        new ForbiddenException('Tenant is suspended — new sales are blocked'),
      );
    });

    it('allows POST when tenant does not exist (fail-open)', async () => {
      tenantsRepository.findById.mockResolvedValue(null);
      await expect(guard.canActivate(makeContext('POST'))).resolves.toBe(true);
    });
  });

  describe('PUT / DELETE — checks tenant status', () => {
    it('throws ForbiddenException on PUT when tenant is suspended', async () => {
      tenantsRepository.findById.mockResolvedValue({
        status: 'suspended',
      } as never);
      await expect(guard.canActivate(makeContext('PUT'))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException on DELETE when tenant is suspended', async () => {
      tenantsRepository.findById.mockResolvedValue({
        status: 'suspended',
      } as never);
      await expect(guard.canActivate(makeContext('DELETE'))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
