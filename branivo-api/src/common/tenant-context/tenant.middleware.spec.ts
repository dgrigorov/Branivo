/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { NotFoundException } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';
import { TenantContext } from './tenant.context';
import { RedisKeyHelper } from '../helpers/redis-key.helper';

const mockTenantDomainRepo = {
  findOne: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockTenantContext = {
  setTenantId: jest.fn(),
  getTenantId: jest.fn(),
};

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const HOST = 'broker1.branivo.bg';

function buildMiddleware(): TenantMiddleware {
  return new TenantMiddleware(
    mockTenantDomainRepo as any,
    mockRedis as any,
    mockTenantContext as unknown as TenantContext,
  );
}

function buildRequest(hostname: string): any {
  return { hostname };
}

describe('TenantMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves tenant from Redis cache and calls setTenantId', async () => {
    mockRedis.get.mockResolvedValueOnce(TENANT_ID);
    const next = jest.fn();

    await buildMiddleware().use(buildRequest(HOST), {} as any, next);

    expect(mockRedis.get).toHaveBeenCalledWith(
      RedisKeyHelper.buildSystem('host', HOST),
    );
    expect(mockTenantDomainRepo.findOne).not.toHaveBeenCalled();
    expect(mockTenantContext.setTenantId).toHaveBeenCalledWith(TENANT_ID);
    expect(next).toHaveBeenCalled();
  });

  it('falls back to DB on Redis cache miss and caches result', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockTenantDomainRepo.findOne.mockResolvedValueOnce({
      tenantId: TENANT_ID,
      tenant: { deletedAt: null },
    });
    mockRedis.set.mockResolvedValueOnce('OK');
    const next = jest.fn();

    await buildMiddleware().use(buildRequest(HOST), {} as any, next);

    expect(mockTenantDomainRepo.findOne).toHaveBeenCalled();
    expect(mockRedis.set).toHaveBeenCalledWith(
      RedisKeyHelper.buildSystem('host', HOST),
      TENANT_ID,
      'EX',
      3600,
    );
    expect(mockTenantContext.setTenantId).toHaveBeenCalledWith(TENANT_ID);
    expect(next).toHaveBeenCalled();
  });

  it('throws NotFoundException for unknown host', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockTenantDomainRepo.findOne.mockResolvedValueOnce(null);
    const next = jest.fn();

    await expect(
      buildMiddleware().use(
        buildRequest('unknown.example.com'),
        {} as any,
        next,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(next).not.toHaveBeenCalled();
  });

  it('falls back to DB gracefully when Redis is unavailable', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Redis connection refused'));
    mockTenantDomainRepo.findOne.mockResolvedValueOnce({
      tenantId: TENANT_ID,
      tenant: { deletedAt: null },
    });
    mockRedis.set.mockRejectedValueOnce(new Error('Redis connection refused'));
    const next = jest.fn();

    await buildMiddleware().use(buildRequest(HOST), {} as any, next);

    expect(mockTenantContext.setTenantId).toHaveBeenCalledWith(TENANT_ID);
    expect(next).toHaveBeenCalled();
  });

  it('does not crash when Redis.set fails after successful DB lookup', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockTenantDomainRepo.findOne.mockResolvedValueOnce({
      tenantId: TENANT_ID,
      tenant: { deletedAt: null },
    });
    mockRedis.set.mockRejectedValueOnce(new Error('Redis write error'));
    const next = jest.fn();

    await buildMiddleware().use(buildRequest(HOST), {} as any, next);

    expect(mockTenantContext.setTenantId).toHaveBeenCalledWith(TENANT_ID);
    expect(next).toHaveBeenCalled();
  });
});
