import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function parseUpstreamResponse(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return res.json() as Promise<unknown>;
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as unknown;

  const apiRes = await fetch(
    `${API_URL}/api/v1/admin/tenants/${params.id}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (apiRes.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const data = await parseUpstreamResponse(apiRes);
  return NextResponse.json(data, { status: apiRes.status });
}
