/**
 * Component tests for Broker Feature Flags Management page.
 * Tests toggle rendering, plan restrictions, optimistic updates, and error states.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FeatureFlagsPage from '@/app/[locale]/(broker)/settings/features/page';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const STARTER_FLAGS = [
  { key: 'fleet', enabled: false, planRestricted: true, requiredPlan: 'professional' },
  { key: 'kasko', enabled: false, planRestricted: true, requiredPlan: 'professional' },
  { key: 'api_access', enabled: false, planRestricted: true, requiredPlan: 'professional' },
  { key: 'sticker_delivery', enabled: true, planRestricted: false, requiredPlan: null },
  { key: 'dkp', enabled: false, planRestricted: false, requiredPlan: null },
  { key: 'renewal_sms', enabled: false, planRestricted: false, requiredPlan: null },
  { key: 'renewal_push', enabled: false, planRestricted: false, requiredPlan: null },
];

describe('FeatureFlagsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows 7 toggles with correct human-readable labels', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { flags: STARTER_FLAGS } }),
    });

    renderWithQuery(<FeatureFlagsPage />);

    await waitFor(() => {
      expect(screen.getByText('Fleet Management')).toBeInTheDocument();
      expect(screen.getByText('Каско Застраховка')).toBeInTheDocument();
      expect(screen.getByText('API Достъп')).toBeInTheDocument();
      expect(screen.getByText('Стикер Доставка')).toBeInTheDocument();
      expect(screen.getByText('Цифров Констативен Протокол')).toBeInTheDocument();
      expect(screen.getByText('SMS Известия за Подновяване')).toBeInTheDocument();
      expect(screen.getByText('Push Известия за Подновяване')).toBeInTheDocument();
    });
  });

  it('plan-restricted flags are disabled with restriction badge', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { flags: STARTER_FLAGS } }),
    });

    renderWithQuery(<FeatureFlagsPage />);

    await waitFor(() => {
      // Fleet Management toggle should be disabled
      const fleetToggle = screen.getByRole('switch', { name: 'Fleet Management' });
      expect(fleetToggle).toBeDisabled();

      // Plan restriction badges should be visible
      const badges = screen.getAllByText(/Изисква Professional план/);
      expect(badges.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('toggle change calls PATCH mutation', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { flags: STARTER_FLAGS } }),
      })
      .mockResolvedValueOnce({
        status: 204,
        ok: true,
      });

    renderWithQuery(<FeatureFlagsPage />);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'SMS Известия за Подновяване' })).toBeInTheDocument();
    });

    const renewalSmsToggle = screen.getByRole('switch', { name: 'SMS Известия за Подновяване' });
    fireEvent.click(renewalSmsToggle);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/tenants/features',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ renewal_sms: true }),
        }),
      );
    });
  });

  it('shows error state when PATCH returns 403', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { flags: STARTER_FLAGS } }),
      })
      .mockResolvedValueOnce({
        status: 403,
        ok: false,
        json: async () => ({
          message: "Feature 'fleet' requires professional or Enterprise plan",
        }),
      });

    renderWithQuery(<FeatureFlagsPage />);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'SMS Известия за Подновяване' })).toBeInTheDocument();
    });

    // Try clicking a non-plan-restricted toggle to trigger the error
    const renewalToggle = screen.getByRole('switch', { name: 'SMS Известия за Подновяване' });
    fireEvent.click(renewalToggle);

    await waitFor(() => {
      expect(
        screen.getByText(/requires professional or Enterprise plan/i),
      ).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    // Never resolves — keep loading state
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    renderWithQuery(<FeatureFlagsPage />);

    expect(screen.getByText('Зареждане на функции...')).toBeInTheDocument();
  });
});
