import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get('access_token')?.value;
  if (!token)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as unknown;
    const apiRes = await fetch(
      `${API_URL}/api/v1/admin/vehicle-catalog/modifications/${id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) return new NextResponse(null, { status: 401 });

  try {
    const { id } = await params;
    const apiRes = await fetch(
      `${API_URL}/api/v1/admin/vehicle-catalog/modifications/${id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (apiRes.status === 204) return new NextResponse(null, { status: 204 });
    const data = (await apiRes.json().catch(() => ({}))) as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(
      { message: 'Грешка при свързване с API' },
      { status: 503 },
    );
  }
}
