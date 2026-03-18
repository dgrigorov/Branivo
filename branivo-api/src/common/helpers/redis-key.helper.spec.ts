import { RedisKeyHelper } from './redis-key.helper';

describe('RedisKeyHelper', () => {
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';

  it('builds key in correct format: {tenant_id}:{domain}:{key}', () => {
    const key = RedisKeyHelper.build(tenantId, 'config', 'tenant');
    expect(key).toBe(`${tenantId}:config:tenant`);
  });

  it('builds session key correctly', () => {
    const key = RedisKeyHelper.build(tenantId, 'session', 'abc123');
    expect(key).toBe(`${tenantId}:session:abc123`);
  });

  it('builds quote key correctly', () => {
    const key = RedisKeyHelper.build(tenantId, 'quote', 'quote-uuid');
    expect(key).toBe(`${tenantId}:quote:quote-uuid`);
  });

  it('uses exact tenantId without modification', () => {
    const key = RedisKeyHelper.build(tenantId, 'domain', 'key');
    expect(key.startsWith(tenantId)).toBe(true);
  });
});
