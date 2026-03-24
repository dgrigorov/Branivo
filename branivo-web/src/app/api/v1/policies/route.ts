import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    data: [
      {
        id: 'pol-001',
        policyNumber: 'GO-2026-00001',
        status: 'active',
        premiumAmount: 245.00,
        currency: 'BGN',
        coverageStartDate: '2026-01-15',
        coverageEndDate: '2027-01-14',
      },
      {
        id: 'pol-002',
        policyNumber: 'GO-2026-00002',
        status: 'active',
        premiumAmount: 312.50,
        currency: 'BGN',
        coverageStartDate: '2026-02-01',
        coverageEndDate: '2027-01-31',
      },
    ],
  });
}
