import { TenantContext } from './tenant.context';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('TenantContext', () => {
  let context: TenantContext;

  beforeEach(() => {
    context = new TenantContext();
  });

  it('throws an error when getTenantId is called before setTenantId', () => {
    expect(() => context.getTenantId()).toThrow(
      'TenantContext not initialized',
    );
  });

  it('returns the correct tenantId after setTenantId is called', () => {
    context.setTenantId(TENANT_ID);
    expect(context.getTenantId()).toBe(TENANT_ID);
  });

  it('each instance is independent (simulates REQUEST scope isolation)', () => {
    const contextA = new TenantContext();
    const contextB = new TenantContext();

    contextA.setTenantId('aaaa-1111');
    contextB.setTenantId('bbbb-2222');

    expect(contextA.getTenantId()).toBe('aaaa-1111');
    expect(contextB.getTenantId()).toBe('bbbb-2222');
  });
});
