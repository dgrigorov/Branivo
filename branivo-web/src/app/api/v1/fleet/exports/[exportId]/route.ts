import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    exportId: 'exp-mock-001',
    status: 'completed',
    totalCount: 2,
    completedCount: 2,
    failedCount: 0,
    failedPolicyIds: [],
    zipS3Key: 'exports/exp-mock-001.zip',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
}
