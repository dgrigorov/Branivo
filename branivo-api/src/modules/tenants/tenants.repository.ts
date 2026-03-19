import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { BaseRepository } from '../../common/base.repository';
import { Tenant } from './entities/tenant.entity';
import { TenantConfig } from './entities/tenant-config.entity';
import { TenantDomain } from './entities/tenant-domain.entity';

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

  async findTenantIdByHostname(hostname: string): Promise<string | null> {
    const domain = await this.domainRepo.findOne({
      where: { domain: hostname },
      relations: ['tenant'],
    });
    if (!domain || !domain.tenant || domain.tenant.deletedAt) return null;
    return domain.tenantId;
  }

  // ─── Super Admin methods (no tenant_id scope) ───────────────────────────────

  async createTenant(data: {
    name: string;
    slug: string;
    status: string;
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

  async updateStatus(id: string, status: string): Promise<void> {
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

  async findByStripeAccountId(stripeAccountId: string): Promise<Tenant | null> {
    return this.repo.findOne({
      where: { stripeAccountId, deletedAt: IsNull() },
    });
  }
}
