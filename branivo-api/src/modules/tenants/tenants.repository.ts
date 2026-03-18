import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { BaseRepository } from '../../common/base.repository';
import { Tenant } from './entities/tenant.entity';
import { TenantConfig } from './entities/tenant-config.entity';

@Injectable()
export class TenantsRepository extends BaseRepository<Tenant> {
  constructor(
    @InjectRepository(Tenant)
    repo: Repository<Tenant>,
    tenantContext: TenantContext,
    @InjectRepository(TenantConfig)
    private readonly configRepo: Repository<TenantConfig>,
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
}
