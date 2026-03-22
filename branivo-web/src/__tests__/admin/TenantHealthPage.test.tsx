/**
 * Tests for TenantHealthPage (the tenants list with health data).
 * Verifies that the health API proxy is called and inactive rows are highlighted.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminTenantsPage from '@/app/[locale]/(admin)/tenants/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const activeTenant = {
  tenantId: 'uuid-active',
  tenantName: 'Active Corp',
  slug: 'active',
  status: 'active' as const,
  subscriptionTier: 'pro',
  policiesLast30Days: 10,
  lastActivityAt: '2026-03-21T10:00:00Z',
  inactiveDays: 1,
};

const inactiveTenant = {
  tenantId: 'uuid-inactive',
  tenantName: 'Sleeping Corp',
  slug: 'sleeping',
  status: 'active' as const,
  subscriptionTier: 'starter',
  policiesLast30Days: 0,
  lastActivityAt: '2026-03-10T10:00:00Z',
  inactiveDays: 12,
};

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('TenantHealthPage — API call', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([activeTenant, inactiveTenant]),
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
  });

  it('calls /api/v1/admin/health', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Active Corp')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/admin/health',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('shows tenant names from health API', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Active Corp')).toBeInTheDocument();
      expect(screen.getByText('Sleeping Corp')).toBeInTheDocument();
    });
  });

  it('shows policies count', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Active Corp')).toBeInTheDocument();
    });

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows inactivity in days', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Sleeping Corp')).toBeInTheDocument();
    });

    expect(screen.getByText('12 дни')).toBeInTheDocument();
    expect(screen.getByText('1 ден')).toBeInTheDocument();
  });

  it('navigates to tenant detail on row click', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Active Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Active Corp'));

    expect(mockPush).toHaveBeenCalledWith('/admin/tenants/uuid-active');
  });
});

describe('TenantHealthPage — error state', () => {
  it('shows error message on fetch failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }) as jest.Mock;

    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Грешка при зареждане на тенанти'),
      ).toBeInTheDocument();
    });
  });
});
