import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    purchaseId: `purchase-${Date.now()}`,
    status: 'processing',
    policiesCreated: 0,
    createdAt: new Date().toISOString(),
  }, { status: 201 });
}
