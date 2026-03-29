import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const USE_MOCK = process.env.USE_MOCK_DATA === 'true';

const MOCK_USERS = [
  {
    id: 'user-001',
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    email: 'admin@branivo.bg',
    role: 'broker_admin',
    twoFaEnabled: false,
    createdAt: '2026-01-01T10:00:00.000Z',
  },
  {
    id: 'user-002',
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    email: 'agent@branivo.bg',
    role: 'broker_agent',
    twoFaEnabled: false,
    createdAt: '2026-01-05T10:00:00.000Z',
  },
  {
    id: 'bbbbbbbb-0000-0000-0000-000000000002',
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    email: 'viewer@branivo.bg',
    role: 'broker_viewer',
    twoFaEnabled: false,
    createdAt: '2026-01-10T10:00:00.000Z',
  },
];

async function parseUpstreamResponse(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return res.json() as Promise<unknown>;
  }
  const text = await res.text();
  return { message: text || 'Upstream error' };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const token = request.cookies.get('access_token')?.value;
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  if (USE_MOCK) {
    const user = MOCK_USERS.find((u) => u.id === id);
    if (!user) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    return NextResponse.json(user);
  }

  const host = request.headers.get('host') ?? '';
  const apiRes = await fetch(`${API_URL}/api/v1/users/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Host: host },
  });
  const data = await parseUpstreamResponse(apiRes);
  return NextResponse.json(data, { status: apiRes.status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const token = request.cookies.get('access_token')?.value;
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as unknown;

  if (USE_MOCK) {
    return NextResponse.json({ id, ...body as object });
  }

  const host = request.headers.get('host') ?? '';
  const apiRes = await fetch(`${API_URL}/api/v1/users/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Host: host,
    },
    body: JSON.stringify(body),
  });
  const data = await parseUpstreamResponse(apiRes);
  return NextResponse.json(data, { status: apiRes.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const host = request.headers.get('host') ?? '';
  const apiRes = await fetch(`${API_URL}/api/v1/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Host: host },
  });
  const data = await parseUpstreamResponse(apiRes);
  return NextResponse.json(data, { status: apiRes.status });
}
