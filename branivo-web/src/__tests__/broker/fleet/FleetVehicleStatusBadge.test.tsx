import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { FleetVehicleStatusBadge } from '@/components/fleet/FleetVehicleStatusBadge';

describe('FleetVehicleStatusBadge', () => {
  it('renders green status with check icon and label', () => {
    render(<FleetVehicleStatusBadge status="green" />);

    const badge = screen.getByLabelText('Активна');
    expect(badge).toHaveClass('bg-green-100', 'text-green-800');
    expect(badge.textContent).toContain('✓');
    expect(badge.textContent).toContain('Активна');
  });

  it('renders yellow status with warning icon and label', () => {
    render(<FleetVehicleStatusBadge status="yellow" />);

    const badge = screen.getByLabelText('Скоро изтича');
    expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800');
    expect(badge.textContent).toContain('⚠');
    expect(badge.textContent).toContain('Скоро изтича');
  });

  it('renders red status with cross icon and label', () => {
    render(<FleetVehicleStatusBadge status="red" />);

    const badge = screen.getByLabelText('Изтекла / Без полица');
    expect(badge).toHaveClass('bg-red-100', 'text-red-800');
    expect(badge.textContent).toContain('✕');
    expect(badge.textContent).toContain('Изтекла / Без полица');
  });

  it('renders correct border classes for each status', () => {
    const { rerender } = render(<FleetVehicleStatusBadge status="green" />);
    expect(screen.getByLabelText('Активна')).toHaveClass('border-green-200');

    rerender(<FleetVehicleStatusBadge status="yellow" />);
    expect(screen.getByLabelText('Скоро изтича')).toHaveClass('border-yellow-200');

    rerender(<FleetVehicleStatusBadge status="red" />);
    expect(screen.getByLabelText('Изтекла / Без полица')).toHaveClass('border-red-200');
  });
});
