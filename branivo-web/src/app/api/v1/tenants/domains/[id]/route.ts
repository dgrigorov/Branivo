import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const res = await fetch(
    `${process.env.BRANIVO_API_URL}/api/v1/tenants/domains/${params.id}`,
    {
      method: 'DELETE',
      headers: { Cookie: request.headers.get('cookie') ?? '' },
    },
  );

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
