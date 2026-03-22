import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'quoteId' ? 'quote-123' : ''),
  }),
}));

// Mock @/lib/hooks/use-payment
const mockMutate = jest.fn();
jest.mock('@/lib/hooks/use-payment', () => ({
  useCreatePaymentIntent: () => ({
    mutate: mockMutate,
    data: { clientSecret: 'pi_test_secret_123', amount: 450, currency: 'BGN' },
    isPending: false,
    isError: false,
  }),
}));

// Mock @stripe/stripe-js
jest.mock('@stripe/stripe-js', () => ({
  loadStripe: jest.fn().mockResolvedValue({}),
}));

const mockConfirmPayment = jest.fn();

// Mock @stripe/react-stripe-js
jest.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stripe-elements">{children}</div>
  ),
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({
    confirmPayment: mockConfirmPayment,
  }),
  useElements: () => ({}),
}));

import PaymentPage from '@/app/[locale]/(client)/quotes/payment/page';

describe('PaymentPage — AC1, AC3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('AC1: renders PaymentElement when clientSecret is available', () => {
    render(<PaymentPage />);
    expect(screen.getByTestId('payment-element')).toBeInTheDocument();
  });

  it('AC1: renders the payment form with amount', () => {
    render(<PaymentPage />);
    expect(screen.getByText(/450.00 BGN/)).toBeInTheDocument();
  });

  it('AC3: Apple Pay cancel (validation_error/incomplete_number) does NOT show error message', async () => {
    mockConfirmPayment.mockResolvedValue({
      error: {
        type: 'validation_error',
        code: 'incomplete_number',
        message: 'Your card number is incomplete.',
      },
    });

    render(<PaymentPage />);

    const submitButton = screen.getByRole('button', { name: /плати/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByText(/Your card number is incomplete/)).not.toBeInTheDocument();
    });
  });

  it('AC3: Google Pay cancel (card_error/cancelled) does NOT show error message', async () => {
    mockConfirmPayment.mockResolvedValue({
      error: {
        type: 'card_error',
        decline_code: 'cancelled',
        message: 'Payment cancelled.',
      },
    });

    render(<PaymentPage />);

    const submitButton = screen.getByRole('button', { name: /плати/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByText(/Payment cancelled/)).not.toBeInTheDocument();
    });
  });

  it('AC3: Real payment failure DOES show error message', async () => {
    mockConfirmPayment.mockResolvedValue({
      error: {
        type: 'card_error',
        code: 'card_declined',
        message: 'Вашата карта е отказана.',
      },
    });

    render(<PaymentPage />);

    const submitButton = screen.getByRole('button', { name: /плати/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Вашата карта е отказана.')).toBeInTheDocument();
    });
  });
});
