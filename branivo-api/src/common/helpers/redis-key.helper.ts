export class RedisKeyHelper {
  /** Tenant-scoped key: `{tenantId}:{domain}:{key}` */
  static build(tenantId: string, domain: string, key: string): string {
    return `${tenantId}:${domain}:${key}`;
  }

  /**
   * System-level key for pre-tenant-resolution lookups: `_system:{domain}:{key}`
   * Used for reverse lookups (e.g. hostname → tenantId) where tenantId is not yet known.
   */
  static buildSystem(domain: string, key: string): string {
    return `_system:${domain}:${key}`;
  }
}
