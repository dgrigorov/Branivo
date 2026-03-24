import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    results: [
      {
        vehicleId: 'v-001',
        licensePlate: 'CA1234AB',
        make: 'Volkswagen',
        model: 'Golf',
        sessionToken: 'mock-session-001',
        status: 'success',
        offers: [
          {
            id: 'offer-001',
            insurerCode: 'ALZ',
            insurerName: 'Алианц',
            price: 245.00,
            currency: 'BGN',
            score: 0.87,
            isRecommended: true,
            status: 'success',
          },
          {
            id: 'offer-002',
            insurerCode: 'DZI',
            insurerName: 'ДЗИ',
            price: 268.50,
            currency: 'BGN',
            score: 0.74,
            isRecommended: false,
            status: 'success',
          },
        ],
      },
    ],
  });
}
