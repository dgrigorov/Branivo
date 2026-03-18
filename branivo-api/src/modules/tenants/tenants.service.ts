import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { TenantsRepository } from './tenants.repository';
import { TenantConfigResponseDto } from './dto/tenant-config-response.dto';

/** Redis TTL for tenant config — 5 minutes per project-context.md */
const TENANT_CONFIG_TTL_SEC = 300;

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly tenantContext: TenantContext,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getTenantConfig(): Promise<TenantConfigResponseDto> {
    const tenantId = this.tenantContext.getTenantId();

    const cached = await this.getConfigFromCache(tenantId);
    if (cached) return cached;

    const tenant = await this.tenantsRepository.findTenantWithConfig(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant configuration not found');
    }

    const dto: TenantConfigResponseDto = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      plan: tenant.plan,
      features: tenant.features,
      branding: {
        primaryColor: tenant.config?.primaryColor ?? '#1A56DB',
        logoUrl: tenant.config?.logoUrl ?? null,
        supportEmail: tenant.config?.supportEmail ?? null,
        supportPhone: tenant.config?.supportPhone ?? null,
      },
    };

    await this.setConfigCache(tenantId, dto);
    return dto;
  }

  private async getConfigFromCache(
    tenantId: string,
  ): Promise<TenantConfigResponseDto | null> {
    try {
      const raw = await this.redis.get(
        RedisKeyHelper.build(tenantId, 'config', 'tenant'),
      );
      if (!raw) return null;
      return JSON.parse(raw) as TenantConfigResponseDto;
    } catch (err) {
      this.logger.warn(
        `Redis cache read failed for tenant config "${tenantId}": ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async setConfigCache(
    tenantId: string,
    dto: TenantConfigResponseDto,
  ): Promise<void> {
    try {
      await this.redis.set(
        RedisKeyHelper.build(tenantId, 'config', 'tenant'),
        JSON.stringify(dto),
        'EX',
        TENANT_CONFIG_TTL_SEC,
      );
    } catch (err) {
      this.logger.warn(
        `Redis cache write failed for tenant config "${tenantId}": ${(err as Error).message}`,
      );
    }
  }
}
