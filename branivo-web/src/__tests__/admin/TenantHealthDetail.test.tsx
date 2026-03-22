/**
 * Component tests for the Tenant Health Detail drill-down page.
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

const mockDetail = {
  tenantId: 'uuid-1',
  tenantName: 'Demo Broker',
  activeUsersCount: 3,
  totalRevenueBgn: 1500.5,
  vehicleCount: 10,
  lastPolicyCreatedAt: '2026-03-20T10:00:00.000Z',
  lastPolicyInsurer: 'Bulins',
  activeFeatureFlags: ['fleet', 'custom_domain'],
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

describe('TenantHealthDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders tenant detail data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetail),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('Demo Broker')).toBeInTheDocument();
    });

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1500.50')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Bulins')).toBeInTheDocument();
  });

  it('renders active feature flag badges', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetail),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('fleet')).toBeInTheDocument();
      expect(screen.getByText('custom_domain')).toBeInTheDocument();
    });
  });

  it('shows "Назад" button that navigates to /admin/tenants', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetail),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('Demo Broker')).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /назад/i });
    fireEvent.click(backButton);

    expect(mockPush).toHaveBeenCalledWith('/admin/tenants');
  });

  it('shows error message on 404', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('Тенантът не е намерен')).toBeInTheDocument();
    });
  });

  it('shows "Няма регистрирани полици" when lastPolicyCreatedAt is null', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockDetail,
          lastPolicyCreatedAt: null,
          lastPolicyInsurer: null,
        }),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('Няма регистрирани полици')).toBeInTheDocument();
    });
  });

  it('shows "Няма активни флагове" when activeFeatureFlags is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ ...mockDetail, activeFeatureFlags: [] }),
    }) as jest.Mock;

    renderWithQuery();

    await waitFor(() => {
      expect(screen.getByText('Няма активни флагове')).toBeInTheDocument();
    });
  });
});
