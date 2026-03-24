import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.BRANIVO_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

const MOCK_DOMAINS = [
  { id: 'dom-001', domain: 'localhost', isPrimary: true, status: 'active' },
  { id: 'dom-002', domain: 'demo.branivo.bg', isPrimary: false, status: 'active' },
];

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${API_URL}/api/v1/tenants/domains`, {
      headers: { Cookie: request.headers.get('cookie') ?? '' },
    });
    if (!res.ok) return NextResponse.json(MOCK_DOMAINS);
    const body = await res.json() as unknown;
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json(MOCK_DOMAINS);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as unknown;
    const res = await fetch(`${API_URL}/api/v1/tenants/domains`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return NextResponse.json(
        { id: `dom-${Date.now()}`, ...body as object, isPrimary: false, status: 'active' },
        { status: 201 },
      );
    }
    const resBody = await res.json() as unknown;
    return NextResponse.json(resBody, { status: res.status });
  } catch {
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}
