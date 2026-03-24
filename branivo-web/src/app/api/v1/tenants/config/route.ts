import { NextResponse } from 'next/server';

const API_URL = process.env.BRANIVO_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

const MOCK_CONFIG = {
  tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
  name: 'Demo Broker',
  slug: 'demo',
  primaryColor: '#1A56DB',
  secondaryColor: '#6B7280',
  supportEmail: 'support@demo.com',
  supportPhone: '+359 2 000 0000',
  logoUrl: null,
  features: {
    stickerDelivery: true,
    dkp: true,
    renewalSms: false,
    renewalPush: false,
    fleet: true,
  },
};

export async function GET(request: Request): Promise<Response> {
  try {
    const res = await fetch(`${API_URL}/api/v1/tenants/config`, {
      headers: {
        Cookie: request.headers.get('cookie') ?? '',
        Host: request.headers.get('host') ?? '',
      },
    });
    if (!res.ok) {
      return NextResponse.json(MOCK_CONFIG);
    }
    return new Response(res.body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return NextResponse.json(MOCK_CONFIG);
  }
}
