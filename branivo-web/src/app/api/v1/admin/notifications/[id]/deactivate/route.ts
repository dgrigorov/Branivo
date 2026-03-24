import { NextResponse } from 'next/server';

export async function PATCH() {
  return new NextResponse(null, { status: 204 });
}
