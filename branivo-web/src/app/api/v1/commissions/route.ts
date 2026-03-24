import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const MOCK_COMMISSIONS = [
  {
    id: 'comm-001',
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    insurerName: 'Allianz Bulgaria',
    productType: 'GO',
    premiumAmount: 450.00,
    commissionPct: 0.05,
    commissionAmount: 22.50,
    status: 'pending',
    createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
  },
  {
    id: 'comm-002',
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    insurerName: 'Generali Bulgaria',
    productType: 'GO',
    premiumAmount: 320.00,
    commissionPct: 0.045,
    commissionAmount: 14.40,
    status: 'paid',
    createdAt: new Date(Date.now() - 15 * 86400_000).toISOString(),
  },
];

export async function GET(request: NextRequest): Promise<Response> {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json(MOCK_COMMISSIONS);
  }

  const url = new URL(request.url);
  const apiUrl = `${API_URL}/api/v1/commissions${url.search}`;

  try {
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json() as unknown;
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json(MOCK_COMMISSIONS);
  }
}
