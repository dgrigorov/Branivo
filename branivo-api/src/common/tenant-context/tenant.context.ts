import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private tenantId: string | undefined;
  private domain: string | undefined;

  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  getTenantId(): string {
    if (!this.tenantId) {
      throw new Error(
        'TenantContext not initialized — TenantMiddleware not applied to this route?',
      );
    }
    return this.tenantId;
  }

  setDomain(domain: string): void {
    this.domain = domain;
  }

  getDomain(): string {
    return this.domain ?? 'branivo.bg';
  }
}
