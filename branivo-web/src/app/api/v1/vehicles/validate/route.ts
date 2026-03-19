import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sessionToken = req.headers.get('x-session-token') ?? '';

  const body: unknown = await req.json().catch(() => ({}));

  const backendRes = await fetch(`${API_BASE}/api/v1/vehicles/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': sessionToken,
      Host: req.headers.get('host') ?? '',
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
