import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BaseRepository } from '../../common/base.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { Policy, PolicyStatus } from './entities/policy.entity';

@Injectable()
export class PoliciesRepository extends BaseRepository<Policy> {
  constructor(
    @InjectRepository(Policy)
    private readonly policyRepo: Repository<Policy>,
    tenantContext: TenantContext,
  ) {
    super(policyRepo, tenantContext);
  }

  // НЕ tenant-scoped — webhook идва без tenant context
  async findByStripeIntentId(intentId: string): Promise<Policy | null> {
    return this.policyRepo.findOne({
      where: { stripePaymentIntentId: intentId, deletedAt: IsNull() },
    });
  }

  // Tenant-scoped за public API
  async findByIdForTenant(id: string): Promise<Policy | null> {
    await this.setTenantSession();
    return this.policyRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
  }

  async activatePolicy(id: string): Promise<void> {
    // САМО status update — commission е IMMUTABLE
    await this.policyRepo.update(id, {
      status: PolicyStatus.ACTIVE,
      updatedAt: new Date(),
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.policyRepo.update(id, {
      status: PolicyStatus.FAILED,
      updatedAt: new Date(),
    });
  }
}
