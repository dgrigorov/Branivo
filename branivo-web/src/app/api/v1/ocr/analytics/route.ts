import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const MOCK_ANALYTICS = {
  stats: [
    { fieldName: 'licensePlate', avgConfidence: 0.94, fallbackRate: 0.03, totalJobs: 142 },
    { fieldName: 'vin', avgConfidence: 0.88, fallbackRate: 0.09, totalJobs: 142 },
    { fieldName: 'make', avgConfidence: 0.97, fallbackRate: 0.01, totalJobs: 142 },
    { fieldName: 'model', avgConfidence: 0.95, fallbackRate: 0.02, totalJobs: 142 },
    { fieldName: 'year', avgConfidence: 0.99, fallbackRate: 0.005, totalJobs: 142 },
  ],
  days: 7,
  generatedAt: new Date().toISOString(),
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json(MOCK_ANALYTICS);
  }

  const { searchParams } = new URL(request.url);
  const upstream = new URL(`${API_URL}/api/v1/ocr/analytics`);
  searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  try {
    const apiRes = await fetch(upstream.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await apiRes.json() as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(MOCK_ANALYTICS);
  }
}
