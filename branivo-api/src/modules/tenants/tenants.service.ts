import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';
import { getContrastRatio, isWcagAA } from '../../common/helpers/wcag.helper';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { S3Service } from '../../infrastructure/s3/s3.service';
import { TenantsRepository } from './tenants.repository';
import { TenantConfig } from './entities/tenant-config.entity';
import { TenantConfigResponseDto } from './dto/tenant-config-response.dto';
import { UpdateBrandingDto } from './dto/update-branding.dto';

/** Redis TTL for tenant config — 5 minutes per project-context.md */
const TENANT_CONFIG_TTL_SEC = 300;

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly tenantContext: TenantContext,
    private readonly s3Service: S3Service,
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
        secondaryColor: tenant.config?.secondaryColor ?? null,
        brandFont: tenant.config?.brandFont ?? null,
        logoUrl: tenant.config?.logoUrl ?? null,
        supportEmail: tenant.config?.supportEmail ?? null,
        supportPhone: tenant.config?.supportPhone ?? null,
      },
    };

    await this.setConfigCache(tenantId, dto);
    return dto;
  }

  async updateBranding(
    dto: UpdateBrandingDto,
    logoFile?: Express.Multer.File,
  ): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();

    // WCAG AA validation — check all provided colors
    const colorsToCheck = [dto.primaryColor, dto.secondaryColor].filter(
      (c): c is string => c !== undefined,
    );
    for (const color of colorsToCheck) {
      if (!isWcagAA(color)) {
        throw new BadRequestException(
          `Color ${color} fails WCAG AA contrast (ratio: ${getContrastRatio(color).toFixed(2)}:1, minimum: 4.5:1)`,
        );
      }
    }

    const update: Partial<TenantConfig> = {};
    if (dto.primaryColor !== undefined) update.primaryColor = dto.primaryColor;
    if (dto.secondaryColor !== undefined)
      update.secondaryColor = dto.secondaryColor;
    if (dto.brandFont !== undefined) update.brandFont = dto.brandFont;

    if (logoFile) {
      const ext =
        logoFile.mimetype === 'image/svg+xml'
          ? ('svg' as const)
          : ('png' as const);
      update.logoUrl = await this.s3Service.uploadLogo(
        tenantId,
        logoFile.buffer,
        ext,
      );
    }

    await this.tenantsRepository.upsertBranding(tenantId, update);

    // Invalidate Redis cache so changes take effect immediately
    await this.redis.del(RedisKeyHelper.build(tenantId, 'config', 'tenant'));
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
