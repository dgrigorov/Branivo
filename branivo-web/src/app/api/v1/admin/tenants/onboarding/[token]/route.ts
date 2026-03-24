import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    brokerName: 'Demo Broker',
    email: 'broker@demo.com',
    status: 'pending',
  });
}
