import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (!token)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const params = request.nextUrl.searchParams.toString();
  const url = `${API_URL}/api/v1/admin/vehicle-catalog/sync/progress${params ? `?${params}` : ''}`;

  try {
    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    // Pipe the SSE stream directly through
    return new NextResponse(apiRes.body, {
      status: apiRes.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    return NextResponse.json(
      { message: 'Грешка при свързване с API' },
      { status: 503 },
    );
  }
}
