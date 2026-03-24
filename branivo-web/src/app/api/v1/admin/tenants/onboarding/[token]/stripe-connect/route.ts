import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ url: 'https://connect.stripe.com/setup/mock' });
}
