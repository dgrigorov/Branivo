import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    oldPlan: 'starter',
    newPlan: 'professional',
    isUpgrade: true,
    affectedFlags: [],
    graceEndsAt: null,
    proratedAmount: 4900,
    effectiveDate: new Date().toISOString(),
  });
}
