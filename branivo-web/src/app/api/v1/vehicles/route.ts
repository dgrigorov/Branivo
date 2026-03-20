import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authorization = req.headers.get('authorization') ?? '';

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
