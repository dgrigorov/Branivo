import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

function getToken(request: NextRequest): string | null {
  return request.cookies.get('access_token')?.value ?? null;
}

export async function GET(request: NextRequest) {
  const token = getToken(request);
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams.toString();
  const url = params
    ? `${API_URL}/api/v1/admin/vehicle-catalog/makes?${params}`
    : `${API_URL}/api/v1/admin/vehicle-catalog/makes`;

  try {
    const apiRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await apiRes.json().catch(() => ({}))) as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(
      { message: 'Грешка при свързване с API' },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const token = getToken(request);
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const apiRes = await fetch(`${API_URL}/api/v1/admin/vehicle-catalog/makes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await apiRes.json().catch(() => ({}))) as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(
      { message: 'Грешка при свързване с API' },
      { status: 503 },
    );
  }
}
