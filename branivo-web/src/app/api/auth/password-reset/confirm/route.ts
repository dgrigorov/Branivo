import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.json() as unknown;
  const host = request.headers.get('host') ?? '';

  const apiRes = await fetch(`${API_URL}/api/v1/auth/password-reset/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: host,
    },
    body: JSON.stringify(body),
  });

  const data = await apiRes.json() as unknown;
  return NextResponse.json(data, { status: apiRes.status });
}
