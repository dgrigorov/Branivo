import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const MOCK_COMMISSIONS = [
  { insurerId: 'ins-001', insurerName: 'Allianz Bulgaria', productType: 'GO', ratePct: 0.05 },
  { insurerId: 'ins-002', insurerName: 'Generali Bulgaria', productType: 'GO', ratePct: 0.045 },
  { insurerId: 'ins-003', insurerName: 'ДЗИ (DSK)', productType: 'GO', ratePct: 0.05 },
  { insurerId: 'ins-004', insurerName: 'Булстрад', productType: 'GO', ratePct: 0.055 },
];

export async function GET(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json(MOCK_COMMISSIONS);
  }

  try {
    const apiRes = await fetch(`${API_URL}/api/v1/admin/commissions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await apiRes.json() as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(MOCK_COMMISSIONS);
  }
}
