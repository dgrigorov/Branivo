import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function PUT(
  request: NextRequest,
  { params }: { params: { insurerId: string; productType: string } },
) {
  const token = request.cookies.get('access_token')?.value;
  const body = await request.json() as unknown;

  if (!token) {
    return NextResponse.json({ insurerId: params.insurerId, productType: params.productType, ...body as object });
  }

  try {
    const apiRes = await fetch(
      `${API_URL}/api/v1/admin/commissions/${params.insurerId}/${params.productType}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      },
    );
    const data = await apiRes.json() as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(
      { message: 'Грешка при свързване с API' },
      { status: 503 },
    );
  }
}
