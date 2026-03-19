import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const res = await fetch(
    `${process.env.BRANIVO_API_URL}/api/v1/tenants/domains`,
    {
      headers: { Cookie: request.headers.get('cookie') ?? '' },
    },
  );
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(
    `${process.env.BRANIVO_API_URL}/api/v1/tenants/domains`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify(body),
    },
  );
  const resBody = await res.json();
  return NextResponse.json(resBody, { status: res.status });
}
