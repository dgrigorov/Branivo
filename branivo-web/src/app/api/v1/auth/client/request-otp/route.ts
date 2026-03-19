import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.BRANIVO_API_URL ?? 'http://localhost:3000';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  const headersList = await headers();
  const host = headersList.get('host') ?? '';

  const res = await fetch(`${API_URL}/api/v1/auth/client/request-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: host,
    },
    body,
  });

  const data = (await res.json()) as unknown;
  return NextResponse.json(data, { status: res.status });
}
