import { NextResponse } from 'next/server';

const API_URL = process.env.BRANIVO_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

const MOCK_BRANDING = {
  primaryColor: '#1A56DB',
  secondaryColor: '#6B7280',
  logoUrl: null,
  supportEmail: 'support@demo.com',
  supportPhone: '+359 2 000 0000',
};

export async function GET(request: Request): Promise<Response> {
  try {
    const res = await fetch(`${API_URL}/api/v1/tenants/branding`, {
      headers: {
        Cookie: request.headers.get('cookie') ?? '',
        Host: request.headers.get('host') ?? '',
      },
    });
    if (!res.ok) {
      return NextResponse.json(MOCK_BRANDING);
    }
    return new Response(res.body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return NextResponse.json(MOCK_BRANDING);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const res = await fetch(`${API_URL}/api/v1/tenants/branding`, {
      method: 'PUT',
      headers: {
        Cookie: request.headers.get('cookie') ?? '',
        Host: request.headers.get('host') ?? '',
      },
      body: formData,
    });
    if (!res.ok) {
      return NextResponse.json(MOCK_BRANDING);
    }
    return new Response(res.body, { status: res.status });
  } catch {
    return NextResponse.json(MOCK_BRANDING);
  }
}
