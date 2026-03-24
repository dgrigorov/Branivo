import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.BRANIVO_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const res = await fetch(`${API_URL}/api/v1/tenants/domains/${params.id}`, {
      method: 'DELETE',
      headers: { Cookie: request.headers.get('cookie') ?? '' },
    });
    if (res.status === 204 || !res.ok) {
      return new NextResponse(null, { status: 204 });
    }
    const body = await res.json() as unknown;
    return NextResponse.json(body, { status: res.status });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
