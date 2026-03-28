import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = request.cookies.get('access_token')?.value;
  const { id } = await params;

  const apiRes = await fetch(`${API_URL}/api/v1/insurers/fsc/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const data = (await apiRes.json().catch(() => ({}))) as unknown;
  return NextResponse.json(data, { status: apiRes.status });
}
