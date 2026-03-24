import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const MOCK_HEALTH: {
  tenantId: string;
  tenantName: string;
  slug: string;
  status: 'active' | 'invited' | 'stripe_connected' | 'suspended';
  subscriptionTier: string;
  policiesLast30Days: number;
  lastActivityAt: string;
  inactiveDays: number;
}[] = [
  {
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    tenantName: 'Demo Broker',
    slug: 'demo',
    status: 'active',
    subscriptionTier: 'starter',
    policiesLast30Days: 12,
    lastActivityAt: new Date(Date.now() - 86400_000).toISOString(),
    inactiveDays: 1,
  },
  {
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000002',
    tenantName: 'Test Broker',
    slug: 'test',
    status: 'invited',
    subscriptionTier: 'professional',
    policiesLast30Days: 0,
    lastActivityAt: new Date(Date.now() - 10 * 86400_000).toISOString(),
    inactiveDays: 10,
  },
];

export async function GET(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json(MOCK_HEALTH);
  }

  try {
    const apiRes = await fetch(`${API_URL}/api/v1/admin/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await apiRes.json() as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(MOCK_HEALTH);
  }
}
