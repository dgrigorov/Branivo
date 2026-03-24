import { NextResponse } from 'next/server';

export async function PUT() {
  return NextResponse.json({ success: true });
}

export async function POST() {
  return NextResponse.json({
    oldPlan: 'starter',
    newPlan: 'professional',
    isUpgrade: true,
    affectedFlags: [],
    graceEndsAt: null,
  });
}
