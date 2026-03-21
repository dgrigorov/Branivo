import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(request: NextRequest): Promise<Response> {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const apiUrl = `${API_URL}/api/v1/commissions${url.search}`;

  try {
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json() as unknown;
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: 'Грешка при свързване с API' },
      { status: 503 },
    );
  }
}
