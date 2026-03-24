import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ exportId: 'exp-mock-001' }, { status: 201 });
}
