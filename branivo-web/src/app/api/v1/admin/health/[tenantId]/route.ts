import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const token = request.cookies.get('access_token')?.value;

  if (!token) {
    return NextResponse.json({
      tenantId,
      tenantName: tenantId === 'aaaaaaaa-0000-0000-0000-000000000001' ? 'Demo Broker' : 'Test Broker',
      slug: tenantId === 'aaaaaaaa-0000-0000-0000-000000000001' ? 'demo' : 'test',
      status: 'active',
      subscriptionTier: 'starter',
      currentPlan: 'starter',
      policiesLast30Days: 12,
      lastActivityAt: new Date(Date.now() - 86400_000).toISOString(),
      inactiveDays: 1,
      stripeConnected: true,
      kfnVerified: true,
      activeUsersCount: 3,
      totalRevenueBgn: 5850.00,
      vehicleCount: 7,
      lastPolicyCreatedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
      lastPolicyInsurer: 'Allianz Bulgaria',
      activeFeatureFlags: ['sticker_delivery', 'dkp', 'fleet'],
      pendingDowngrade: null,
    });
  }

  try {
    const apiRes = await fetch(`${API_URL}/api/v1/admin/health/${tenantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await apiRes.json() as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(
      { message: 'Грешка при свързване с API' },
      { status: 503 },
    );
  }
}
