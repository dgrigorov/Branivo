import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import VehicleListPage from '@/app/[locale]/(client)/vehicles/page';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockVehicle = {
  id: 'vehicle-uuid-456',
  tenantId: 'tenant-uuid',
  ownerId: 'owner-uuid',
  vin: 'WVWZZZ3BZ3E123456',
  licensePlate: 'СА1234АА',
  make: 'VW',
  model: 'Golf',
  year: 2020,
  color: null,
  engineVolume: null,
  fuelType: null,
  firstRegistrationDate: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastPolicyStatus: null,
};

describe('VehicleListPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state with CTA when no vehicles', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<VehicleListPage />);

    await waitFor(() => {
      expect(screen.getByText('Добави МПС')).toBeInTheDocument();
    });

    expect(screen.getByText('Нямате регистрирани МПС-та')).toBeInTheDocument();
  });

  it('renders vehicle list when vehicles exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [mockVehicle],
    });

    render(<VehicleListPage />);

    await waitFor(() => {
      expect(screen.getByText('Моите МПС-та')).toBeInTheDocument();
    });

    expect(screen.getByText('VW Golf (2020)')).toBeInTheDocument();
    expect(screen.getByText('СА1234АА')).toBeInTheDocument();
  });
});
