import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    shipmentId: 'ship-001',
    provider: 'speedy',
    trackingNumber: 'SP123456789BG',
    estimatedDeliveryDate: '2026-04-01',
    status: 'dispatched',
    createdAt: new Date().toISOString(),
  });
}
