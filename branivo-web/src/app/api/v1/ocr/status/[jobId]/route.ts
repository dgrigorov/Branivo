import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } },
): Promise<NextResponse> {
  const { jobId } = params;

  const backendRes = await fetch(`${API_BASE}/api/v1/ocr/status/${jobId}`, {
    headers: {
      Host: req.headers.get('host') ?? '',
    },
  });

  const data: unknown = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
