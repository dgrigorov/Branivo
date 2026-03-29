import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function parseUpstreamResponse(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return res.json() as Promise<unknown>;
  }
  const text = await res.text();
  return { message: text || 'Upstream error' };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.cookies.get('access_token')?.value;
  const body = await request.json() as unknown;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const host = request.headers.get('host') ?? '';
  const apiRes = await fetch(`${API_URL}/api/v1/users/${params.id}/role`, {
    method: 'PUT',
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
