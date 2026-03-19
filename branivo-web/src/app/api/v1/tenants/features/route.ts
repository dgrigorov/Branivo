import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(
      `${process.env.BRANIVO_API_URL}/api/v1/tenants/features`,
      {
        headers: { Cookie: request.headers.get('cookie') ?? '' },
      },
    );
    const body: unknown = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: 'Failed to fetch feature flags' },
      { status: 502 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(
      `${process.env.BRANIVO_API_URL}/api/v1/tenants/features`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: request.headers.get('cookie') ?? '',
        },
        body: JSON.stringify(body),
      },
    );
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const resBody: unknown = await res.json();
    return NextResponse.json(resBody, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: 'Failed to update feature flags' },
      { status: 502 },
    );
  }
}
