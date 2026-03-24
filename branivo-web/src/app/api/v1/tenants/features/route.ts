import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.BRANIVO_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

const MOCK_FEATURES = {
  stickerDelivery: true,
  dkp: true,
  renewalSms: false,
  renewalPush: false,
  fleet: true,
  apiAccess: false,
};

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${API_URL}/api/v1/tenants/features`, {
      headers: { Cookie: request.headers.get('cookie') ?? '' },
    });
    if (!res.ok) return NextResponse.json(MOCK_FEATURES);
    const body: unknown = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json(MOCK_FEATURES);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as unknown;
    const res = await fetch(`${API_URL}/api/v1/tenants/features`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify(body),
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    if (!res.ok) return new NextResponse(null, { status: 204 });
    const resBody: unknown = await res.json();
    return NextResponse.json(resBody, { status: res.status });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
