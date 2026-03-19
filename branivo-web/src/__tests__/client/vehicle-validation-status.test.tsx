import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VehicleValidationStatus } from '@/app/[locale]/(client)/vehicles/components/vehicle-validation-status';

const defaultProps = {
  katStatus: null,
  gfStatus: null,
  canProceed: false,
  isBlocked: false,
  vinError: null,
};

describe('VehicleValidationStatus', () => {
  it('renders KAT verified badge', () => {
    render(
      <VehicleValidationStatus
        {...defaultProps}
        katStatus="ok"
        gfStatus="clean"
        canProceed={true}
      />,
    );

    expect(screen.getByText('КАТ: Верифициран')).toBeInTheDocument();
    expect(screen.getByText('Гаранционен фонд: OK')).toBeInTheDocument();
  });

  it('renders manual fallback warning with checkbox', () => {
    const onConfirm = jest.fn();
    render(
      <VehicleValidationStatus
        {...defaultProps}
        katStatus="manual_fallback"
        gfStatus="clean"
        canProceed={true}
        onKatManualConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByText('Не успяхме да верифицираме VIN автоматично. Моля, проверете ръчно.'),
    ).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('renders GF blocked alert with role="alert"', () => {
    render(
      <VehicleValidationStatus
        {...defaultProps}
        isBlocked={true}
        canProceed={false}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('МПС с нерегламентиран статус')).toBeInTheDocument();
  });

  it('proceed button disabled when blocked', () => {
    render(
      <VehicleValidationStatus
        {...defaultProps}
        katStatus="ok"
        gfStatus="clean"
        canProceed={false}
      />,
    );

    const button = screen.getByRole('button', { name: /продължи към оферти/i });
    expect(button).toBeDisabled();
  });
});
