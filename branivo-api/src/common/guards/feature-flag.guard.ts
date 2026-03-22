import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContext } from '../tenant-context/tenant.context';
import { TenantsRepository } from '../../modules/tenants/tenants.repository';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantsRepository: TenantsRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const flag = this.reflector.getAllAndOverride<string>('feature_flag', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!flag) return true;

    const tenantId = this.tenantContext.getTenantId();
    const tenant = await this.tenantsRepository.findById(tenantId);
    const features = tenant?.features ?? {};

    if (!features[flag]) {
      throw new NotFoundException();
    }
    return true;
  }
}
