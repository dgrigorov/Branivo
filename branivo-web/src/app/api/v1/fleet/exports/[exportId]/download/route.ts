import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    downloadUrl: 'https://example.com/mock-export.zip',
    expiresInSeconds: 900,
  });
}
