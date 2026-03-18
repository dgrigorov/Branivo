/* eslint-disable @typescript-eslint/unbound-method */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FeatureFlagGuard } from './feature-flag.guard';
import { TenantContext } from '../tenant-context/tenant.context';
import { TenantsRepository } from '../../modules/tenants/tenants.repository';
import { Tenant } from '../../modules/tenants/entities/tenant.entity';

const mockTenant = (features: Record<string, boolean>): Partial<Tenant> => ({
  id: 'tenant-uuid',
  features,
});

function makeCtx(handler: object = {}, cls: object = {}): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('FeatureFlagGuard', () => {
  let guard: FeatureFlagGuard;
  let reflector: jest.Mocked<Reflector>;
  let tenantsRepo: jest.Mocked<TenantsRepository>;
  let tenantContext: jest.Mocked<TenantContext>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        FeatureFlagGuard,
        {
          provide: Reflector,
          useValue: { getAllAndOverride: jest.fn() },
        },
        {
          provide: TenantsRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: TenantContext,
          useValue: { getTenantId: jest.fn().mockReturnValue('tenant-uuid') },
        },
      ],
    }).compile();

    guard = module.get(FeatureFlagGuard);
    reflector = module.get(Reflector);
    tenantsRepo = module.get(TenantsRepository);
    tenantContext = module.get(TenantContext);
  });

  it('returns true when no @FeatureFlag decorator is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await guard.canActivate(makeCtx());

    expect(result).toBe(true);
    expect(tenantsRepo.findById).not.toHaveBeenCalled();
  });

  it('returns true when feature flag is enabled for tenant', async () => {
    reflector.getAllAndOverride.mockReturnValue('fleet');
    tenantsRepo.findById.mockResolvedValue(
      mockTenant({ fleet: true }) as Tenant,
    );

    const result = await guard.canActivate(makeCtx());

    expect(result).toBe(true);
    expect(tenantContext.getTenantId).toHaveBeenCalled();
    expect(tenantsRepo.findById).toHaveBeenCalledWith('tenant-uuid');
  });

  it('throws ForbiddenException when feature flag is false', async () => {
    reflector.getAllAndOverride.mockReturnValue('fleet');
    tenantsRepo.findById.mockResolvedValue(
      mockTenant({ fleet: false }) as Tenant,
    );

    await expect(guard.canActivate(makeCtx())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when features object is empty', async () => {
    reflector.getAllAndOverride.mockReturnValue('fleet');
    tenantsRepo.findById.mockResolvedValue(mockTenant({}) as Tenant);

    await expect(guard.canActivate(makeCtx())).rejects.toThrow(
      new ForbiddenException('Feature not enabled: fleet'),
    );
  });

  it('throws ForbiddenException when tenant is not found', async () => {
    reflector.getAllAndOverride.mockReturnValue('api_access');
    tenantsRepo.findById.mockResolvedValue(null);

    await expect(guard.canActivate(makeCtx())).rejects.toThrow(
      ForbiddenException,
    );
  });
});
