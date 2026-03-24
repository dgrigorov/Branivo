import { NextResponse } from 'next/server';

export async function PUT() {
  return new NextResponse(null, { status: 204 });
}
