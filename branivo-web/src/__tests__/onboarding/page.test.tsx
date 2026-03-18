/**
 * Component tests for the Broker Onboarding Page.
 * Tests cover the main flows: valid token, status-based steps, and error states.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import OnboardingPage from '@/app/[locale]/onboarding/page';

// Mock next/navigation
const mockGet = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockGet }),
  useRouter: () => ({ push: jest.fn() }),
}));

// Mock react-hook-form to simplify tests
jest.mock('react-hook-form', () => ({
  ...jest.requireActual('react-hook-form'),
  useForm: () => ({
    register: () => ({}),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handleSubmit: (_fn: unknown) => (e: React.FormEvent) => {
      e.preventDefault();
    },
    watch: jest.fn().mockReturnValue(''),
    setValue: jest.fn(),
    formState: { errors: {} },
  }),
}));

const setupFetchMock = (
  responses: Array<{ ok: boolean; body: unknown }>,
) => {
  let callIndex = 0;
  global.fetch = jest.fn().mockImplementation(() => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve({
      ok: response.ok,
      json: () => Promise.resolve(response.body),
    });
  });
};

describe('OnboardingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReturnValue('valid-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders tenant name for valid token', async () => {
    setupFetchMock([
      {
        ok: true,
        body: {
          tenantId: 'tenant-uuid',
          email: 'broker@test.com',
          tenantName: 'Тест Брокер',
          tenantStatus: 'invited',
        },
      },
    ]);

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/Тест Брокер/i)).toBeInTheDocument();
    });
  });

  it('shows Stripe Connect button when status is invited', async () => {
    setupFetchMock([
      {
        ok: true,
        body: {
          tenantId: 'tenant-uuid',
          email: 'broker@test.com',
          tenantName: 'Тест Брокер',
          tenantStatus: 'invited',
        },
      },
    ]);

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Свържи с Stripe/i })).toBeInTheDocument();
    });
  });

  it('shows КФН form when status is stripe_connected', async () => {
    setupFetchMock([
      {
        ok: true,
        body: {
          tenantId: 'tenant-uuid',
          email: 'broker@test.com',
          tenantName: 'Тест Брокер',
          tenantStatus: 'stripe_connected',
        },
      },
    ]);

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Верифицирай/i })).toBeInTheDocument();
    });
  });

  it('shows error message for invalid or expired token', async () => {
    setupFetchMock([{ ok: false, body: { message: 'Invitation not found or expired' } }]);

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/невалиден или изтекъл/i)).toBeInTheDocument();
    });
  });

  it('shows error when no token provided', async () => {
    mockGet.mockReturnValue(null);

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/невалиден линк/i)).toBeInTheDocument();
    });
  });
});
