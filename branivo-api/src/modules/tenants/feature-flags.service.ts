import { Repository } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { RedisKeyHelper } from '../../common/helpers/redis-key.helper';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { Tenant } from './entities/tenant.entity';
import { UpdateFeatureFlagsDto } from './dto/update-feature-flags.dto';
import {
  FeatureFlagsResponseDto,
  FeatureFlagDefinition,
} from './dto/feature-flags-response.dto';

/** Дефиниция на всички feature флагове и plan ограниченията им */
const FLAG_DEFINITIONS: Array<{
  key: string;
  requiredPlan: string | null;
  allowedPlans: string[];
}> = [
  {
    key: 'fleet',
    requiredPlan: 'professional',
    allowedPlans: ['professional', 'enterprise'],
  },
  {
    key: 'kasko',
    requiredPlan: 'professional',
    allowedPlans: ['professional', 'enterprise'],
  },
  {
    key: 'api_access',
    requiredPlan: 'professional',
    allowedPlans: ['professional', 'enterprise'],
  },
  {
    key: 'sticker_delivery',
    requiredPlan: null,
    allowedPlans: ['starter', 'professional', 'enterprise'],
  },
  {
    key: 'dkp',
    requiredPlan: null,
    allowedPlans: ['starter', 'professional', 'enterprise'],
  },
  {
    key: 'renewal_sms',
    requiredPlan: null,
    allowedPlans: ['starter', 'professional', 'enterprise'],
  },
  {
    key: 'renewal_push',
    requiredPlan: null,
    allowedPlans: ['starter', 'professional', 'enterprise'],
  },
];

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly tenantContext: TenantContext,
    private readonly auditService: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getFeatureFlags(): Promise<FeatureFlagsResponseDto> {
    const tenantId = this.tenantContext.getTenantId();
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const flags: FeatureFlagDefinition[] = FLAG_DEFINITIONS.map((def) => ({
      key: def.key,
      enabled: tenant.features[def.key] === true,
      planRestricted:
        def.requiredPlan !== null && !def.allowedPlans.includes(tenant.plan),
      requiredPlan: def.requiredPlan,
    }));

    return { flags };
  }

  async updateFeatureFlags(
    dto: UpdateFeatureFlagsDto,
    userId: string,
  ): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const updates = Object.entries(dto).filter(([, v]) => v !== undefined) as [
      string,
      boolean,
    ][];

    // Validate plan restrictions before making any changes
    for (const [flag, newValue] of updates) {
      if (newValue === true) {
        const def = FLAG_DEFINITIONS.find((d) => d.key === flag);
        if (def && !def.allowedPlans.includes(tenant.plan)) {
          throw new ForbiddenException(
            `Feature '${flag}' requires ${def.requiredPlan ?? 'higher'} or Enterprise plan`,
          );
        }
      }
    }

    // Build a set of known safe flag keys — defence-in-depth against unknown keys in SQL
    const SAFE_FLAG_KEYS = new Set(FLAG_DEFINITIONS.map((d) => d.key));

    let anyChanged = false;

    for (const [flag, newValue] of updates) {
      // Skip unknown keys — should never happen due to ValidationPipe whitelist,
      // but added as defence-in-depth to prevent JSONB key injection
      if (!SAFE_FLAG_KEYS.has(flag)) continue;

      const oldValue = tenant.features[flag] === true;
      if (oldValue === newValue) continue;

      anyChanged = true;

      // Atomic JSONB update at PostgreSQL level — prevents race conditions
      await this.tenantRepo
        .createQueryBuilder()
        .update(Tenant)
        .set({
          features: () => `features || '{"${flag}": ${newValue}}'::jsonb`,
        })
        .where('id = :id', { id: tenantId })
        .execute();

      // Audit log — immutable INSERT only
      await this.writeAuditLog({
        tenantId,
        userId,
        flag,
        oldValue,
        newValue,
        entityId: tenantId,
      });
    }

    // Invalidate Redis config cache only when at least one flag actually changed
    if (anyChanged) {
      await this.redis.del(RedisKeyHelper.build(tenantId, 'config', 'tenant'));
    }
  }

  private async writeAuditLog(entry: {
    tenantId: string;
    userId: string;
    flag: string;
    oldValue: boolean;
    newValue: boolean;
    entityId: string;
  }): Promise<void> {
    await this.auditService.log({
      tenantId: entry.tenantId,
      userId: entry.userId,
      action: 'feature_flag.updated',
      entityType: 'tenant',
      entityId: entry.entityId,
      metadata: {
        flag: entry.flag,
        old_value: entry.oldValue,
        new_value: entry.newValue,
      },
    });
  }
}
