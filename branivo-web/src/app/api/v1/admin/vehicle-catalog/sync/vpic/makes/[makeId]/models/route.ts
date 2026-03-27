import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ makeId: string }> },
) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { makeId } = await params;
    const apiRes = await fetch(
      `${API_URL}/api/v1/admin/vehicle-catalog/sync/vpic/makes/${makeId}/models`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const data = (await apiRes.json().catch(() => ({}))) as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(
      { message: 'Грешка при свързване с API' },
      { status: 503 },
    );
  }
}
