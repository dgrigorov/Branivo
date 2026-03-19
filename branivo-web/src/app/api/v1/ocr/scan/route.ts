import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sessionToken = req.headers.get('x-session-token');
  if (!sessionToken) {
    return NextResponse.json(
      { message: 'Липсва X-Session-Token header.' },
      { status: 400 },
    );
  }

  const formData = await req.formData();

  const backendRes = await fetch(`${API_BASE}/api/v1/ocr/scan`, {
    method: 'POST',
    headers: {
      'X-Session-Token': sessionToken,
      Host: req.headers.get('host') ?? '',
    },
    body: formData,
  });

  const data: unknown = await backendRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: backendRes.status });
}
