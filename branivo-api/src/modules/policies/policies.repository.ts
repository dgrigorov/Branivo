import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
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

  // НЕ tenant-scoped — webhook идва без tenant context (INSERT без RLS session)
  async saveWithoutTenantScope(entity: Partial<Policy>): Promise<Policy> {
    return this.policyRepo.save(entity as Policy);
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

  // НЕ tenant-scoped — за job context (PDF generation processor)
  async findByIdWithoutScope(id: string): Promise<Policy | null> {
    return this.policyRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
  }

  async updatePdfKeys(
    id: string,
    policyPdfKey: string,
    greenCardKey: string,
  ): Promise<void> {
    await this.policyRepo.update(id, {
      policyPdfS3Key: policyPdfKey,
      greenCardPdfS3Key: greenCardKey,
      updatedAt: new Date(),
    });
  }

  async markDocumentsEmailed(id: string): Promise<void> {
    await this.policyRepo.update(id, {
      documentsEmailedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async findByEndClientId(
    endClientId: string,
    tenantId: string,
  ): Promise<Policy[]> {
    return this.policyRepo.find({
      where: { endClientId, tenantId, deletedAt: IsNull() },
    });
  }

  async findManyByIds(
    tenantId: string,
    policyIds: string[],
  ): Promise<Policy[]> {
    if (policyIds.length === 0) return [];
    return this.policyRepo.find({
      where: { tenantId, id: In(policyIds), deletedAt: IsNull() },
    });
  }
}
