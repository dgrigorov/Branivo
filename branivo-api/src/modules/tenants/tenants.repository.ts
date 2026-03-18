import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { BaseRepository } from '../../common/base.repository';
import { Tenant } from './entities/tenant.entity';
import { TenantConfig } from './entities/tenant-config.entity';
import { TenantDomain } from './entities/tenant-domain.entity';

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

  async findTenantIdByHostname(hostname: string): Promise<string | null> {
    const domain = await this.domainRepo.findOne({
      where: { domain: hostname },
      relations: ['tenant'],
    });
    if (!domain || !domain.tenant || domain.tenant.deletedAt) return null;
    return domain.tenantId;
  }
}
