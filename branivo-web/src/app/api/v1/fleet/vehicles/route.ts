import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    data: [
      {
        id: 'fv-001',
        vehicleId: 'v-001',
        licensePlate: 'CA1234AB',
        make: 'Volkswagen',
        model: 'Golf',
        insurerName: 'Алианц',
        policyExpiresAt: '2026-09-15T00:00:00.000Z',
        activePolicyId: 'pol-001',
        status: 'green',
      },
      {
        id: 'fv-002',
        vehicleId: 'v-002',
        licensePlate: 'PB5678CD',
        make: 'Toyota',
        model: 'Corolla',
        insurerName: 'ДЗИ',
        policyExpiresAt: '2026-04-20T00:00:00.000Z',
        activePolicyId: 'pol-002',
        status: 'yellow',
      },
      {
        id: 'fv-003',
        vehicleId: 'v-003',
        licensePlate: 'BT9012EF',
        make: 'BMW',
        model: '3 Series',
        insurerName: null,
        policyExpiresAt: null,
        activePolicyId: null,
        status: 'red',
      },
    ],
    meta: {
      total: 3,
      page: 1,
      limit: 50,
      timestamp: new Date().toISOString(),
    },
  });
}
