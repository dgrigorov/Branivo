import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  DriverVehicleCard,
  type DriverVehicle,
} from '@/components/fleet/DriverVehicleCard';

function makeVehicle(overrides: Partial<DriverVehicle> = {}): DriverVehicle {
  return {
    vehicleId: 'v-id-1',
    licensePlate: 'КА0001ФЛ',
    make: 'BMW',
    model: 'X5',
    insurerName: 'Allianz Bulgaria',
    policyExpiresAt: null,
    policyStatus: null,
    ...overrides,
  };
}

describe('DriverVehicleCard — assign driver interaction', () => {
  it('renders vehicle information correctly for driver view', () => {
    const vehicle = makeVehicle({
      licensePlate: 'КА0001ФЛ',
      make: 'BMW',
      model: 'X5',
      insurerName: 'Allianz Bulgaria',
    });

    render(<DriverVehicleCard vehicle={vehicle} />);

    expect(screen.getByText('КА0001ФЛ')).toBeInTheDocument();
    expect(screen.getByText('BMW X5')).toBeInTheDocument();
    expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument();
  });

  it('renders "Няма активна полица" for vehicle without policy', () => {
    render(
      <DriverVehicleCard
        vehicle={makeVehicle({ policyExpiresAt: null, policyStatus: null })}
      />,
    );

    expect(screen.getByText('Няма активна полица')).toBeInTheDocument();
  });

  it('shows expiry date when policy is active', () => {
    const expiry = '2026-06-15';
    render(
      <DriverVehicleCard
        vehicle={makeVehicle({
          policyExpiresAt: expiry,
          policyStatus: 'active',
        })}
      />,
    );

    expect(screen.getByText(/Изтича:/)).toBeInTheDocument();
  });

  it('driver card does not render bulk action controls', () => {
    render(<DriverVehicleCard vehicle={makeVehicle()} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Получи оферти')).not.toBeInTheDocument();
    expect(screen.queryByText('Изтегли документи')).not.toBeInTheDocument();
  });
});

describe('FleetVehicleCard — status display for driver', () => {
  it('renders green status when policy expires far in the future', () => {
    const farFuture = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    render(
      <DriverVehicleCard
        vehicle={makeVehicle({
          policyExpiresAt: farFuture,
          policyStatus: 'active',
        })}
      />,
    );

    expect(screen.getByLabelText('Активна')).toBeInTheDocument();
  });

  it('renders red status when no policy', () => {
    render(
      <DriverVehicleCard
        vehicle={makeVehicle({ policyExpiresAt: null, policyStatus: null })}
      />,
    );

    expect(screen.getByLabelText('Изтекла / Без полица')).toBeInTheDocument();
  });
});
