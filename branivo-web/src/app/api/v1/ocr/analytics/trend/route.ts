import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

function generateMockTrend(days: number) {
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400_000);
    points.push({
      date: date.toISOString().split('T')[0],
      avgConfidence: 0.88 + Math.random() * 0.1,
      fallbackRate: 0.02 + Math.random() * 0.05,
      totalJobs: Math.floor(10 + Math.random() * 20),
    });
  }
  return points;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get('days') ?? '7');
    return NextResponse.json(generateMockTrend(days));
  }

  const { searchParams } = new URL(request.url);
  const upstream = new URL(`${API_URL}/api/v1/ocr/analytics/trend`);
  searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  try {
    const apiRes = await fetch(upstream.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await apiRes.json() as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(generateMockTrend(7));
  }
}
