import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { InlineRegistration } from '@/app/[locale]/(client)/quotes/components/inline-registration';

// Mock the useClientAuth hook
jest.mock('@/lib/hooks/use-client-auth');
const mockUseClientAuth = jest.requireMock('@/lib/hooks/use-client-auth') as {
  useClientAuth: jest.Mock;
  RateLimitError: typeof import('@/lib/hooks/use-client-auth').RateLimitError;
  OtpExpiredError: typeof import('@/lib/hooks/use-client-auth').OtpExpiredError;
};

const { RateLimitError, OtpExpiredError } = jest.requireActual<typeof import('@/lib/hooks/use-client-auth')>(
  '@/lib/hooks/use-client-auth',
);

function makeHook(overrides: Record<string, unknown> = {}) {
  return {
    requestOtp: jest.fn().mockResolvedValue({ expires_in: 300 }),
    verifyOtp: jest.fn().mockResolvedValue({ id: 'uid', phone_number: '+35988', is_new: true }),
    isLoading: false,
    error: null,
    ...overrides,
  };
}

const defaultProps = {
  sessionId: 'session-uuid',
  onSuccess: jest.fn(),
  onClose: jest.fn(),
};

describe('InlineRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders phone entry form by default and announces expansion', () => {
    mockUseClientAuth.useClientAuth.mockReturnValue(makeHook());

    render(<InlineRegistration {...defaultProps} />);

    expect(screen.getByLabelText(/телефонен номер/i)).toBeInTheDocument();
    // WCAG announcement
    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveTextContent('Регистрационен формуляр се разгъна');
  });

  it('WCAG — aria-live region announces form expansion', () => {
    mockUseClientAuth.useClientAuth.mockReturnValue(makeHook());

    render(<InlineRegistration {...defaultProps} />);

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveTextContent('Регистрационен формуляр се разгъна');
  });

  it('shows OTP form after phone submit', async () => {
    const requestOtp = jest.fn().mockResolvedValue({ expires_in: 300 });
    mockUseClientAuth.useClientAuth.mockReturnValue(makeHook({ requestOtp }));

    render(<InlineRegistration {...defaultProps} />);

    const phoneInput = screen.getByLabelText(/телефонен номер/i);
    fireEvent.change(phoneInput, { target: { value: '+35988123456' } });

    const submitBtn = screen.getByRole('button', { name: /изпрати код/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/код от sms/i)).toBeInTheDocument();
    });
  });

  it('calls onSuccess when OTP is verified correctly', async () => {
    const onSuccess = jest.fn();
    const verifyOtp = jest.fn().mockResolvedValue({ id: 'uid', phone_number: '+35988', is_new: true });
    const requestOtp = jest.fn().mockResolvedValue({ expires_in: 300 });
    mockUseClientAuth.useClientAuth.mockReturnValue(makeHook({ requestOtp, verifyOtp }));

    render(<InlineRegistration {...defaultProps} onSuccess={onSuccess} />);

    // Submit phone
    fireEvent.change(screen.getByLabelText(/телефонен номер/i), { target: { value: '+35988' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /изпрати код/i }));
    });

    // Submit OTP
    await waitFor(() => screen.getByLabelText(/код от sms/i));
    fireEvent.change(screen.getByLabelText(/код от sms/i), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /потвърди/i }));
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({ id: 'uid', phone_number: '+35988', is_new: true });
    });
  });

  it('shows rate limit message on 429 response', async () => {
    const requestOtp = jest.fn().mockRejectedValue(new RateLimitError(3600));
    mockUseClientAuth.useClientAuth.mockReturnValue(makeHook({ requestOtp }));

    render(<InlineRegistration {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/телефонен номер/i), { target: { value: '+35988' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /изпрати код/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/твърде много кодове/i);
    });
  });

  it('shows expired message with resend button on 422 response during OTP entry', async () => {
    const requestOtp = jest.fn().mockResolvedValue({ expires_in: 300 });
    const verifyOtp = jest.fn().mockRejectedValue(new OtpExpiredError());
    mockUseClientAuth.useClientAuth.mockReturnValue(makeHook({ requestOtp, verifyOtp }));

    render(<InlineRegistration {...defaultProps} />);

    // Navigate to OTP entry
    fireEvent.change(screen.getByLabelText(/телефонен номер/i), { target: { value: '+35988' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /изпрати код/i }));
    });
    await waitFor(() => screen.getByLabelText(/код от sms/i));

    // Submit wrong OTP
    fireEvent.change(screen.getByLabelText(/код от sms/i), { target: { value: '000000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /потвърди/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/кодът изтече/i);
    });
    expect(screen.getByRole('button', { name: /изпрати нов код/i })).toBeInTheDocument();
  });
});
