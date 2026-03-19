import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import QuotesPage from '@/app/[locale]/(client)/quotes/page';

// Mock the hook
jest.mock('@/lib/hooks/use-anonymous-session');
const mockUseAnonymousSession = jest.requireMock('@/lib/hooks/use-anonymous-session') as {
  useAnonymousSession: jest.Mock;
};

// Mock next/navigation router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ locale: 'bg' }),
}));

function defaultHookState(overrides = {}) {
  return {
    sessionId: 'session-uuid-test',
    isLoading: false,
    isExpired: false,
    requiresLogin: false,
    updateSessionData: jest.fn(),
    ...overrides,
  };
}

describe('QuotesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows vehicle form fields for new active session', () => {
    mockUseAnonymousSession.useAnonymousSession.mockReturnValue(defaultHookState());

    render(<QuotesPage />);

    expect(screen.getByLabelText(/регистрационен номер/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/vin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/марка/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/модел/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/година/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /сравни оферти/i })).toBeInTheDocument();
  });

  it('shows expiry banner when session is expired', () => {
    mockUseAnonymousSession.useAnonymousSession.mockReturnValue(
      defaultHookState({ isExpired: true, sessionId: 'new-session-after-expiry' }),
    );

    render(<QuotesPage />);

    expect(screen.getByRole('alert', { name: /session-expired-banner/i })).toBeInTheDocument();
    expect(screen.getByText(/сесията ви изтече/i)).toBeInTheDocument();
  });

  it('redirects to login when requiresLogin is true (Redis degradation)', async () => {
    mockUseAnonymousSession.useAnonymousSession.mockReturnValue(
      defaultHookState({ requiresLogin: true, sessionId: null }),
    );

    render(<QuotesPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/bg/login');
    });
  });

  it('cross-device banner is visible by default', () => {
    mockUseAnonymousSession.useAnonymousSession.mockReturnValue(defaultHookState());

    render(<QuotesPage />);

    expect(screen.getByRole('note', { name: /cross-device-banner/i })).toBeInTheDocument();
    expect(screen.getByText(/офертите важат 48 часа/i)).toBeInTheDocument();
  });
});
