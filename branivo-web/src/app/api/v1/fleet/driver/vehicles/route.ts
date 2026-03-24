import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json([
    {
      id: 'fv-001',
      licensePlate: 'CA1234AB',
      make: 'Volkswagen',
      model: 'Golf',
      year: 2021,
      vin: 'WVWZZZ1KZAM123456',
      policyStatus: 'active',
    },
  ]);
}
