export class RedisKeyHelper {
  static build(tenantId: string, domain: string, key: string): string {
    return `${tenantId}:${domain}:${key}`;
  }
}
