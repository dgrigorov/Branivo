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
import { EmailService } from '../../common/email/email.service';
import { AdminSubscriptionRepository } from './repositories/admin-subscription.repository';
import { TierChangePreviewResponseDto } from './dto/tier-change-preview-response.dto';
import {
  PLAN_TIERS,
  buildFeaturesForPlan,
  computeDowngradedFlags,
} from './subscription-tiers';

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class AdminSubscriptionService {
  private readonly logger = new Logger(AdminSubscriptionService.name);

  constructor(
    private readonly adminSubscriptionRepository: AdminSubscriptionRepository,
    private readonly emailService: EmailService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async previewTierChange(
    tenantId: string,
    newPlan: string,
  ): Promise<TierChangePreviewResponseDto> {
    const tenant =
      await this.adminSubscriptionRepository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
    this.assertValidTierChange(tenant.plan, newPlan);
    return this.buildPreview(tenant.plan, newPlan, tenant.features);
  }

  async changeTier(
    tenantId: string,
    newPlan: string,
    adminId: string,
  ): Promise<TierChangePreviewResponseDto> {
    const tenant =
      await this.adminSubscriptionRepository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
    this.assertValidTierChange(tenant.plan, newPlan);

    const preview = this.buildPreview(tenant.plan, newPlan, tenant.features);
    const newFeatures = buildFeaturesForPlan(tenant.features, newPlan);

    if (preview.isUpgrade) {
      await this.adminSubscriptionRepository.applyUpgrade(
        tenantId,
        newPlan,
        newFeatures,
      );
    } else {
      await this.adminSubscriptionRepository.schedulePendingDowngrade(
        tenantId,
        {
          newPlan,
          enforceAt: preview.graceEndsAt!,
        },
      );
    }

    // Audit log always runs before non-critical operations (Redis/email)
    await this.adminSubscriptionRepository.insertAuditLog({
      tenantId,
      userId: adminId,
      action: 'subscription.tier_changed',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: {
        old_tier: tenant.plan,
        new_tier: newPlan,
        affected_flags: preview.affectedFlags,
        is_upgrade: preview.isUpgrade,
      },
    });

    if (preview.isUpgrade) {
      try {
        await this.redis.del(
          RedisKeyHelper.build(tenantId, 'config', 'tenant'),
        );
      } catch (err) {
        this.logger.warn(
          `Redis cache invalidation failed for tenant ${tenantId}`,
          err,
        );
      }
    } else {
      await this.sendDowngradeNotification(
        tenantId,
        preview.affectedFlags,
        preview.graceEndsAt!,
      );
    }

    return preview;
  }

  async enforcePendingDowngrades(): Promise<void> {
    const due =
      await this.adminSubscriptionRepository.findTenantsWithDuePendingDowngrade();

    for (const tenant of due) {
      const { id, plan: oldPlan, features, pendingDowngrade } = tenant;
      try {
        const { newPlan } = pendingDowngrade;
        const affectedFlags = computeDowngradedFlags(features, newPlan);
        const newFeatures = buildFeaturesForPlan(features, newPlan);

        await this.adminSubscriptionRepository.applyPendingDowngrade(
          id,
          newPlan,
          newFeatures,
        );

        await this.adminSubscriptionRepository.insertAuditLog({
          tenantId: id,
          userId: null,
          action: 'subscription.downgrade_enforced',
          entityType: 'tenant',
          entityId: id,
          metadata: {
            old_tier: oldPlan,
            new_tier: newPlan,
            affected_flags: affectedFlags,
          },
        });

        try {
          await this.redis.del(RedisKeyHelper.build(id, 'config', 'tenant'));
        } catch (redisErr) {
          this.logger.warn(
            `Redis cache invalidation failed for tenant ${id}`,
            redisErr,
          );
        }

        this.logger.log(
          `Enforced pending downgrade for tenant ${id}: ${oldPlan} → ${pendingDowngrade.newPlan}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to enforce pending downgrade for tenant ${id}`,
          err,
        );
      }
    }
  }

  private assertValidTierChange(currentPlan: string, newPlan: string): void {
    if (newPlan === currentPlan) {
      throw new BadRequestException('Tenant is already on this plan');
    }
    if (!PLAN_TIERS[newPlan]) {
      throw new BadRequestException(`Invalid plan: ${newPlan}`);
    }
  }

  private buildPreview(
    oldPlan: string,
    newPlan: string,
    currentFeatures: Record<string, boolean>,
  ): TierChangePreviewResponseDto {
    const isUpgrade =
      PLAN_TIERS[newPlan].monthlyFee > (PLAN_TIERS[oldPlan]?.monthlyFee ?? 0);
    const affectedFlags = isUpgrade
      ? []
      : computeDowngradedFlags(currentFeatures, newPlan);
    const graceEndsAt = isUpgrade
      ? null
      : new Date(Date.now() + GRACE_PERIOD_MS).toISOString();

    const dto = new TierChangePreviewResponseDto();
    dto.oldPlan = oldPlan;
    dto.newPlan = newPlan;
    dto.isUpgrade = isUpgrade;
    dto.affectedFlags = affectedFlags;
    dto.graceEndsAt = graceEndsAt;
    return dto;
  }

  private async sendDowngradeNotification(
    tenantId: string,
    affectedFlags: string[],
    graceEndsAt: string,
  ): Promise<void> {
    const email =
      await this.adminSubscriptionRepository.findBrokerAdminEmail(tenantId);
    if (!email) {
      this.logger.warn(
        `No broker_admin email found for tenant ${tenantId} — skipping downgrade notification`,
      );
      return;
    }
    await this.emailService.sendDowngradeNotification(
      email,
      affectedFlags,
      graceEndsAt,
    );
  }
}
