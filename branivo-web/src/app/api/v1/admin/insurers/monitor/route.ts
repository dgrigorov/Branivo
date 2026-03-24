import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const MOCK_INSURERS = [
  {
    id: 'ins-001',
    name: 'Allianz Bulgaria',
    code: 'allianz',
    isActive: true,
    isManuallyDisabled: false,
    rating: 4.5,
    claimSpeed: 8.5,
    lastResponseMs: 120,
    lastCheckedAt: new Date().toISOString(),
  },
  {
    id: 'ins-002',
    name: 'Generali Bulgaria',
    code: 'generali',
    isActive: true,
    isManuallyDisabled: false,
    rating: 4.2,
    claimSpeed: 7.8,
    lastResponseMs: 250,
    lastCheckedAt: new Date().toISOString(),
  },
  {
    id: 'ins-003',
    name: 'ДЗИ (DSK)',
    code: 'dsk',
    isActive: true,
    isManuallyDisabled: false,
    rating: 4.0,
    claimSpeed: 7.0,
    lastResponseMs: 180,
    lastCheckedAt: new Date().toISOString(),
  },
  {
    id: 'ins-004',
    name: 'Булстрад',
    code: 'bulstrad',
    isActive: false,
    isManuallyDisabled: true,
    rating: 3.8,
    claimSpeed: 6.5,
    lastResponseMs: null,
    lastCheckedAt: new Date(Date.now() - 3600_000).toISOString(),
  },
];

export async function GET(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json(MOCK_INSURERS);
  }

  try {
    const apiRes = await fetch(`${API_URL}/api/v1/admin/insurers/monitor`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await apiRes.json() as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(MOCK_INSURERS);
  }
}
