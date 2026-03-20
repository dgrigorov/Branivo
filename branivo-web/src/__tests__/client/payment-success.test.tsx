import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import PaymentSuccessPage from '@/app/[locale]/(client)/quotes/payment/success/page';

describe('PaymentSuccessPage', () => {
  it('renders "Плащането е прието" success message', () => {
    render(<PaymentSuccessPage />);
    expect(screen.getByText('Плащането е прието')).toBeInTheDocument();
  });

  it('renders "Подготвяме вашата полица..." processing message', () => {
    render(<PaymentSuccessPage />);
    expect(
      screen.getByText('Подготвяме вашата полица...'),
    ).toBeInTheDocument();
  });

  it('does NOT contain policy activation call — no "активирана" or "активация"', () => {
    const { container } = render(<PaymentSuccessPage />);
    expect(container.textContent).not.toContain('активирана');
    expect(container.textContent).not.toContain('активация');
  });

  it('shows loading spinner for async processing', () => {
    render(<PaymentSuccessPage />);
    // Spinner is shown as an animated div
    expect(screen.getByText('Обработва се')).toBeInTheDocument();
  });
});
