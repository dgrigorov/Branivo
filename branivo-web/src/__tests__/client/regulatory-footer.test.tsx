import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { RegulatoryFooter } from '@/app/[locale]/(client)/components/regulatory-footer';

describe('RegulatoryFooter', () => {
  it('returns null when both kfnLicense and einCode are null', () => {
    const { container } = render(
      <RegulatoryFooter kfnLicense={null} einCode={null} legalName={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders only KFN license when einCode is null', () => {
    render(
      <RegulatoryFooter kfnLicense="12345" einCode={null} legalName={null} />,
    );
    expect(screen.getByText(/КФН Лиценз: 12345/)).toBeInTheDocument();
    expect(screen.queryByText(/ЕИК:/)).not.toBeInTheDocument();
  });

  it('renders full footer with all fields', () => {
    render(
      <RegulatoryFooter
        kfnLicense="12345"
        einCode="123456789"
        legalName="Иванов Брокер ЕООД"
      />,
    );
    expect(screen.getByText('Иванов Брокер ЕООД')).toBeInTheDocument();
    expect(screen.getByText(/КФН Лиценз: 12345/)).toBeInTheDocument();
    expect(screen.getByText(/ЕИК: 123456789/)).toBeInTheDocument();
  });
});
