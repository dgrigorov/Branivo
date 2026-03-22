import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  DriverVehicleCard,
  type DriverVehicle,
} from '@/components/fleet/DriverVehicleCard';

function makeVehicle(overrides: Partial<DriverVehicle> = {}): DriverVehicle {
  const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  return {
    vehicleId: 'v-id-1',
    licensePlate: 'КА0001ФЛ',
    make: 'BMW',
    model: 'X5',
    insurerName: 'Allianz Bulgaria',
    policyExpiresAt: futureDate,
    policyStatus: 'active',
    ...overrides,
  };
}

describe('DriverVehicleCard', () => {
  it('renders license plate, make and model', () => {
    render(<DriverVehicleCard vehicle={makeVehicle()} />);

    expect(screen.getByText('КА0001ФЛ')).toBeInTheDocument();
    expect(screen.getByText('BMW X5')).toBeInTheDocument();
  });

  it('renders insurer name when provided', () => {
    render(<DriverVehicleCard vehicle={makeVehicle()} />);

    expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument();
  });

  it('renders dash when insurer name is null', () => {
    render(<DriverVehicleCard vehicle={makeVehicle({ insurerName: null })} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders policy expiry date when provided', () => {
    const expiry = '2026-06-15';
    render(
      <DriverVehicleCard
        vehicle={makeVehicle({ policyExpiresAt: expiry, policyStatus: 'active' })}
      />,
    );

    expect(screen.getByText(/Изтича:/)).toBeInTheDocument();
  });

  it('renders "Няма активна полица" when policyExpiresAt is null', () => {
    render(
      <DriverVehicleCard
        vehicle={makeVehicle({ policyExpiresAt: null, policyStatus: null })}
      />,
    );

    expect(screen.getByText('Няма активна полица')).toBeInTheDocument();
  });

  it('shows green status badge for policy expiring in 60 days', () => {
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    render(
      <DriverVehicleCard
        vehicle={makeVehicle({
          policyExpiresAt: futureDate,
          policyStatus: 'active',
        })}
      />,
    );

    expect(screen.getByLabelText('Активна')).toBeInTheDocument();
  });

  it('shows red status badge when no policy', () => {
    render(
      <DriverVehicleCard
        vehicle={makeVehicle({ policyExpiresAt: null, policyStatus: null })}
      />,
    );

    expect(screen.getByLabelText('Изтекла / Без полица')).toBeInTheDocument();
  });
});
