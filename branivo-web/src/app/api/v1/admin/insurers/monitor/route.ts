import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const USE_MOCK = process.env.USE_MOCK_DATA === 'true';

const MOCK_INSURERS = [
  {
    insurerId: 'ins-001',
    insurerName: 'Allianz Bulgaria',
    insurerCode: 'allianz',
    circuitState: 'closed' as const,
    errorRate5min: 0.00,
    avgLatencyMs: 120,
    totalCalls5min: 47,
    isManuallyDisabled: false,
    disabledReason: null,
  },
  {
    insurerId: 'ins-002',
    insurerName: 'Generali Bulgaria',
    insurerCode: 'generali',
    circuitState: 'closed' as const,
    errorRate5min: 1.23,
    avgLatencyMs: 250,
    totalCalls5min: 31,
    isManuallyDisabled: false,
    disabledReason: null,
  },
  {
    insurerId: 'ins-003',
    insurerName: 'ДЗИ (DSK)',
    insurerCode: 'dsk',
    circuitState: 'half-open' as const,
    errorRate5min: 12.50,
    avgLatencyMs: 1850,
    totalCalls5min: 8,
    isManuallyDisabled: false,
    disabledReason: null,
  },
  {
    insurerId: 'ins-004',
    insurerName: 'Булстрад',
    insurerCode: 'bulstrad',
    circuitState: 'open' as const,
    errorRate5min: 67.80,
    avgLatencyMs: 4200,
    totalCalls5min: 5,
    isManuallyDisabled: true,
    disabledReason: 'API деградация — висок error rate',
  },
  {
    insurerId: 'ins-005',
    insurerName: 'Армеец',
    insurerCode: 'armeec',
    circuitState: 'closed' as const,
    errorRate5min: 0.50,
    avgLatencyMs: 180,
    totalCalls5min: 22,
    isManuallyDisabled: false,
    disabledReason: null,
  },
];

export async function GET(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (USE_MOCK || !token) {
    return NextResponse.json(MOCK_INSURERS);
  }

  try {
    const apiRes = await fetch(`${API_URL}/api/v1/admin/insurers/monitor`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!apiRes.ok) {
      return NextResponse.json(MOCK_INSURERS);
    }
    const data = await apiRes.json() as unknown;
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(MOCK_INSURERS);
  }
}
