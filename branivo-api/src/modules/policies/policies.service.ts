import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { PoliciesRepository } from './policies.repository';
import { Policy } from './entities/policy.entity';

@Injectable()
export class PoliciesService {
  constructor(
    private readonly policiesRepo: PoliciesRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  // Tenant-scoped: за broker/end-client достъп до полиците
  async findPolicyById(id: string): Promise<Policy | null> {
    return this.policiesRepo.findByIdForTenant(id);
  }
}
