import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { BaseRepository } from '../../common/base.repository';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { TenantConfig } from './entities/tenant-config.entity';
import { TenantDomain, DomainStatus } from './entities/tenant-domain.entity';

// Super Admin context methods are below (no tenant_id scope — documented exception)

@Injectable()
export class TenantsRepository extends BaseRepository<Tenant> {
  constructor(
    @InjectRepository(Tenant)
    repo: Repository<Tenant>,
    tenantContext: TenantContext,
    @InjectRepository(TenantConfig)
    private readonly configRepo: Repository<TenantConfig>,
    @InjectRepository(TenantDomain)
    private readonly domainRepo: Repository<TenantDomain>,
  ) {
    super(repo, tenantContext);
  }

  async findTenantWithConfig(
    tenantId: string,
  ): Promise<(Tenant & { config: TenantConfig | null }) | null> {
    const tenant = await this.repo.findOne({
      where: { id: tenantId, deletedAt: IsNull() },
    });
    if (!tenant) return null;

    const config = await this.configRepo.findOne({
      where: { tenantId },
    });

    return Object.assign(tenant, { config: config ?? null });
  }

  async upsertBranding(
    tenantId: string,
    data: Partial<TenantConfig>,
  ): Promise<void> {
    await this.configRepo.upsert(
      { tenantId, ...data },
      { conflictPaths: ['tenantId'] },
    );
  }

  // ─── Domain methods (tenant-scoped) ──────────────────────────────────────────

  async findDomainsByTenantId(tenantId: string): Promise<TenantDomain[]> {
    return this.domainRepo.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  async findDomainById(
    id: string,
    tenantId: string,
  ): Promise<TenantDomain | null> {
    return this.domainRepo.findOne({ where: { id, tenantId } });
  }

  async findCustomDomainByTenantId(
    tenantId: string,
  ): Promise<TenantDomain | null> {
    return this.domainRepo.findOne({ where: { tenantId, isPrimary: false } });
  }

  async createCustomDomain(
    tenantId: string,
    domain: string,
    verificationToken: string,
  ): Promise<TenantDomain> {
    const entity = this.domainRepo.create({
      tenantId,
      domain,
      isPrimary: false,
      status: 'pending',
      verificationToken,
      verifiedAt: null,
      failureReason: null,
    });
    return this.domainRepo.save(entity);
  }

  async updateDomainStatus(
    id: string,
    status: DomainStatus,
    extra?: { verifiedAt?: Date; failureReason?: string },
  ): Promise<void> {
    await this.domainRepo.update(id, { status, ...extra });
  }

  async deleteDomain(id: string, tenantId: string): Promise<void> {
    await this.domainRepo.delete({ id, tenantId });
  }

  /**
   * Resolves tenant ID from hostname.
   * Only 'active' domains belonging to non-deleted tenants are valid (AC7).
   * Uses a JOIN WHERE to avoid loading the full Tenant entity.
   */
  async findTenantIdByHostname(hostname: string): Promise<string | null> {
    const result = await this.domainRepo
      .createQueryBuilder('d')
      .select('d.tenant_id', 'tenantId')
      .innerJoin('d.tenant', 't', 't.deleted_at IS NULL')
      .where('d.domain = :hostname', { hostname })
      .andWhere("d.status = 'active'")
      .getRawOne<{ tenantId: string }>();
    return result?.tenantId ?? null;
  }

  // ─── Cron job methods (system context — no tenant scope) ─────────────────────

  async findPendingOrVerifyingDomains(): Promise<TenantDomain[]> {
    return this.domainRepo.find({
      where: [{ status: 'pending' }, { status: 'verifying' }],
    });
  }

  // ─── Super Admin methods (no tenant_id scope) ───────────────────────────────

  async createTenant(data: {
    name: string;
    slug: string;
    status: TenantStatus;
  }): Promise<Tenant> {
    const tenant = this.repo.create(data);
    return this.repo.save(tenant);
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { slug, deletedAt: IsNull() } });
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  async findAllForAdmin(
    page: number,
    limit: number,
  ): Promise<[Tenant[], number]> {
    return this.repo.findAndCount({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async updateStatus(id: string, status: TenantStatus): Promise<void> {
    await this.repo.update(id, { status });
  }

  async updateStripeAccount(
    id: string,
    stripeAccountId: string,
  ): Promise<void> {
    await this.repo.update(id, { stripeAccountId });
  }

  async activateTenant(id: string, kfnLicense: string): Promise<void> {
    await this.repo.update(id, { kfnLicense, status: 'active' });
  }

  async updateKfnLicense(id: string, kfnLicense: string): Promise<void> {
    // Post-activation update — does NOT change status (unlike activateTenant)
    await this.repo.update(id, { kfnLicense });
  }

  async findByStripeAccountId(stripeAccountId: string): Promise<Tenant | null> {
    return this.repo.findOne({
      where: { stripeAccountId, deletedAt: IsNull() },
    });
  }
}
