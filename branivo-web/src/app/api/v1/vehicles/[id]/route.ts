import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const authorization = req.headers.get('authorization') ?? '';

  const backendRes = await fetch(`${API_BASE}/api/v1/vehicles/${params.id}`, {
    method: 'GET',
    headers: {
      Authorization: authorization,
      Host: req.headers.get('host') ?? '',
    },
  });

  const data: unknown = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
