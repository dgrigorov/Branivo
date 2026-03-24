import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

const MOCK_VEHICLES = [
  {
    id: 'v-001',
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    clientId: 'client-001',
    licensePlate: 'CA1234AB',
    vin: 'WVWZZZ1KZAM123456',
    make: 'Volkswagen',
    model: 'Golf',
    year: 2021,
    lastPolicyStatus: 'active',
    createdAt: '2026-01-10T10:00:00.000Z',
  },
  {
    id: 'v-002',
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    clientId: 'client-001',
    licensePlate: 'PB5678CD',
    vin: 'TMBJB7NE5G0123456',
    make: 'Toyota',
    model: 'Corolla',
    year: 2019,
    lastPolicyStatus: 'expired',
    createdAt: '2026-01-15T10:00:00.000Z',
  },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.replace('Bearer ', '').trim();

  // UAT fallback: return mock data when no client token is present
  if (!token) {
    return NextResponse.json(MOCK_VEHICLES);
  }

  const backendRes = await fetch(`${API_BASE}/api/v1/vehicles`, {
    method: 'GET',
    headers: {
      Authorization: authorization,
      Host: req.headers.get('host') ?? '',
    },
  });

  const data: unknown = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authorization = req.headers.get('authorization') ?? '';

  const body: unknown = await req.json().catch(() => ({}));

  const backendRes = await fetch(`${API_BASE}/api/v1/vehicles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      Host: req.headers.get('host') ?? '',
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
