import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3000';
const USE_MOCK = process.env.USE_MOCK_DATA === 'true';

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
  const token = req.cookies.get('access_token')?.value;

  if (USE_MOCK || !token) {
    return NextResponse.json(MOCK_VEHICLES);
  }

  const backendRes = await fetch(`${API_BASE}/api/v1/vehicles`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Host: req.headers.get('host') ?? '',
    },
  });

  if (!backendRes.ok) {
    return NextResponse.json(MOCK_VEHICLES);
  }

  const data: unknown = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get('access_token')?.value;

  const body: unknown = await req.json().catch(() => ({}));

  if (USE_MOCK || !token) {
    return NextResponse.json(
      { id: `v-${Date.now()}`, ...body as object, createdAt: new Date().toISOString() },
      { status: 201 },
    );
  }

  const backendRes = await fetch(`${API_BASE}/api/v1/vehicles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Host: req.headers.get('host') ?? '',
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
