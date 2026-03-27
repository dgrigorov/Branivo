import { NextResponse } from 'next/server';

export async function GET() {
  const today = new Date();
  const expiredEndDate = new Date(today);
  expiredEndDate.setMonth(expiredEndDate.getMonth() - 2);
  const activeEndDate = new Date(today);
  activeEndDate.setFullYear(activeEndDate.getFullYear() + 1);

  return NextResponse.json({
    data: [
      {
        id: 'pol-001',
        policyNumber: 'GO-2026-00001',
        status: 'active',
        premiumAmount: 245.00,
        currency: 'BGN',
        coverageStartDate: '2026-01-15',
        coverageEndDate: activeEndDate.toISOString().split('T')[0],
      },
      {
        id: 'pol-002',
        policyNumber: 'GO-2024-00002',
        status: 'active',
        premiumAmount: 312.50,
        currency: 'BGN',
        coverageStartDate: '2024-02-01',
        coverageEndDate: expiredEndDate.toISOString().split('T')[0],
      },
    ],
  });
}
