/**
 * Component tests for the Subscription Tier section in TenantHealthDetailPage.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TenantHealthDetailPage from '@/app/[locale]/(admin)/tenants/[id]/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ id: 'uuid-1', locale: 'bg' }),
}));

const mockDetailBase = {
  tenantId: 'uuid-1',
  tenantName: 'Demo Broker',
  activeUsersCount: 3,
  totalRevenueBgn: 1500.5,
  vehicleCount: 10,
  lastPolicyCreatedAt: '2026-03-20T10:00:00.000Z',
  lastPolicyInsurer: 'Bulins',
  activeFeatureFlags: ['fleet', 'api_access'],
  currentPlan: 'professional',
  pendingDowngrade: null,
};

const mockPreviewUpgrade = {
  oldPlan: 'professional',
  newPlan: 'enterprise',
  isUpgrade: true,
  affectedFlags: [],
  graceEndsAt: null,
};

const mockPreviewDowngrade = {
  oldPlan: 'professional',
  newPlan: 'starter',
  isUpgrade: false,
  affectedFlags: ['fleet', 'api_access'],
  graceEndsAt: '2026-03-29T00:00:00.000Z',
};

function renderWithQuery() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TenantHealthDetailPage />
    </QueryClientProvider>,
  );
}

describe('TenantHealthDetailPage — Subscription Section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows plan badge with current plan', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetailBase),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('Абонаментен план')).toBeInTheDocument();
    });

    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('shows starter plan badge', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ ...mockDetailBase, currentPlan: 'starter' }),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('Starter')).toBeInTheDocument();
    });
  });

  it('shows enterprise plan badge', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ ...mockDetailBase, currentPlan: 'enterprise' }),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('Enterprise')).toBeInTheDocument();
    });
  });

  it('shows pending downgrade banner when pendingDowngrade is set', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockDetailBase,
          pendingDowngrade: { newPlan: 'starter', enforceAt: '2026-03-29T00:00:00.000Z' },
        }),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText(/Pending downgrade/i)).toBeInTheDocument();
    });
    // Banner should mention the downgrade target plan
    expect(screen.getAllByText(/Starter/).length).toBeGreaterThan(0);
  });

  it('does NOT show pending downgrade banner when pendingDowngrade is null', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetailBase),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('Абонаментен план')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Pending downgrade/i)).not.toBeInTheDocument();
  });

  it('shows plan dropdown with available plans (excluding current)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetailBase), // currentPlan = 'professional'
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByLabelText('Избери нов план')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Избери нов план') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('starter');
    expect(options).toContain('enterprise');
    expect(options).not.toContain('professional'); // current plan excluded
  });

  it('shows upgrade preview modal on plan change click', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDetailBase),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPreviewUpgrade),
      });

    global.fetch = fetchMock as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByLabelText('Избери нов план')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Избери нов план'), {
      target: { value: 'enterprise' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Промени план/i }));

    await waitFor(() => {
      expect(screen.getByText('Потвърди промяна на план')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Новите features ще бъдат активирани незабавно/i),
    ).toBeInTheDocument();
  });

  it('shows downgrade preview modal with affectedFlags and 7-day warning', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDetailBase),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPreviewDowngrade),
      });

    global.fetch = fetchMock as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByLabelText('Избери нов план')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Избери нов план'), {
      target: { value: 'starter' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Промени план/i }));

    await waitFor(() => {
      expect(screen.getByText('Потвърди промяна на план')).toBeInTheDocument();
    });

    expect(screen.getByText(/fleet, api_access/i)).toBeInTheDocument();
    expect(screen.getByText(/Брокерът ще получи email известие/i)).toBeInTheDocument();
  });

  it('closes modal on Отказ click', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDetailBase),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPreviewUpgrade),
      });

    global.fetch = fetchMock as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByLabelText('Избери нов план')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Избери нов план'), {
      target: { value: 'enterprise' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Промени план/i }));

    await waitFor(() => {
      expect(screen.getByText('Потвърди промяна на план')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Отказ/i }));

    await waitFor(() => {
      expect(
        screen.queryByText('Потвърди промяна на план'),
      ).not.toBeInTheDocument();
    });
  });

  it('submits tier change on Потвърди click', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDetailBase),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPreviewUpgrade),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPreviewUpgrade),
      })
      // invalidate query re-fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ ...mockDetailBase, currentPlan: 'enterprise' }),
      });

    global.fetch = fetchMock as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByLabelText('Избери нов план')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Избери нов план'), {
      target: { value: 'enterprise' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Промени план/i }));

    await waitFor(() => {
      expect(screen.getByText('Потвърди промяна на план')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Потвърди/i }));

    // Modal should close after successful mutation
    await waitFor(() => {
      expect(
        screen.queryByText('Потвърди промяна на план'),
      ).not.toBeInTheDocument();
    });

    // Verify the POST was called with correct plan
    const calls = (fetchMock as jest.Mock).mock.calls as [string, RequestInit][];
    const postCall = calls.find(([, opts]) => opts?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(postCall![1].body).toContain('enterprise');
  });
});
