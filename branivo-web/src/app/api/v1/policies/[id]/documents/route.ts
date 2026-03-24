import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    policyPdfUrl: 'https://example.com/mock-policy.pdf',
    greenCardUrl: 'https://example.com/mock-green-card.pdf',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
}
