import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const apiRes = await fetch(`${API_URL}/api/v1/admin/insurers/monitor`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await apiRes.json() as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(
      { message: 'Грешка при свързване с API' },
      { status: 503 },
    );
  }
}
