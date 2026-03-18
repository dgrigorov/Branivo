import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private tenantId: string | undefined;

  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  getTenantId(): string {
    if (!this.tenantId) throw new Error('TenantContext not initialized');
    return this.tenantId;
  }
}
