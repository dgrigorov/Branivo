import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TenantContext } from '../tenant-context/tenant.context';
import { TenantsRepository } from '../../modules/tenants/tenants.repository';

@Injectable()
export class TenantActiveGuard implements CanActivate {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest<{ method: string }>();

    // Read-only operations are always allowed — even for suspended tenants
    if (request.method === 'GET' || request.method === 'HEAD') {
      return true;
    }

    const tenantId = this.tenantContext.getTenantId();
    const tenant = await this.tenantsRepository.findById(tenantId);

    if (tenant?.status === 'suspended') {
      throw new ForbiddenException(
        'Tenant is suspended — new sales are blocked',
      );
    }

    return true;
  }
}
