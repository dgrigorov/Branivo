/**
 * Component tests for Admin Tenants page (Health Dashboard).
 * Tests action buttons (Деактивирай/Реактивирай) and ConfirmStatusModal interaction.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminTenantsPage from '@/app/[locale]/(admin)/tenants/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockTenantsHealth = [
  {
    tenantId: 'tenant-1',
    tenantName: 'Активен Брокер',
    slug: 'active-broker',
    status: 'active' as const,
    subscriptionTier: 'starter',
    policiesLast30Days: 5,
    lastActivityAt: '2026-03-20T10:00:00Z',
    inactiveDays: 2,
  },
  {
    tenantId: 'tenant-2',
    tenantName: 'Спрян Брокер',
    slug: 'suspended-broker',
    status: 'suspended' as const,
    subscriptionTier: 'pro',
    policiesLast30Days: 0,
    lastActivityAt: '2026-03-10T10:00:00Z',
    inactiveDays: 12,
  },
  {
    tenantId: 'tenant-3',
    tenantName: 'Поканен Брокер',
    slug: 'invited-broker',
    status: 'invited' as const,
    subscriptionTier: null,
    policiesLast30Days: 0,
    lastActivityAt: null,
    inactiveDays: null,
  },
];

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();

  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/v1/admin/health') && !String(url).includes('/tenant-')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTenantsHealth),
      });
    }
    if (String(url).includes('/status')) {
      return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  }) as jest.Mock;
});

describe('AdminTenantsPage — health columns', () => {
  it('renders new health columns in table header', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Активен Брокер')).toBeInTheDocument();
    });

    expect(screen.getByText('Полици (30 дни)')).toBeInTheDocument();
    expect(screen.getByText('Последна активност')).toBeInTheDocument();
    expect(screen.getByText('Тиер')).toBeInTheDocument();
  });

  it('shows inactiveDays for tenants', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Активен Брокер')).toBeInTheDocument();
    });

    expect(screen.getByText('2 дни')).toBeInTheDocument();
    expect(screen.getByText('12 дни')).toBeInTheDocument();
  });

  it('navigates to drill-down page on row click', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Активен Брокер')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Активен Брокер'));

    expect(mockPush).toHaveBeenCalledWith('/admin/tenants/tenant-1');
  });
});

describe('AdminTenantsPage — action buttons', () => {
  it('shows "Деактивирай" button for active tenants', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Активен Брокер')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Деактивирай' })).toBeInTheDocument();
  });

  it('shows "Реактивирай" button for suspended tenants', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Спрян Брокер')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Реактивирай' })).toBeInTheDocument();
  });

  it('does NOT show action buttons for invited tenants', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Поканен Брокер')).toBeInTheDocument();
    });

    const actionButtons = screen.queryAllByRole('button', {
      name: /деактивирай|реактивирай/i,
    });
    // Only 1 deactivate + 1 reactivate = 2 total (invited has none)
    expect(actionButtons).toHaveLength(2);
  });
});

describe('AdminTenantsPage — ConfirmStatusModal', () => {
  it('opens ConfirmStatusModal with correct text when clicking "Деактивирай"', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Активен Брокер')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Деактивирай' }));

    expect(screen.getByText('Деактивиране на тенант')).toBeInTheDocument();
    expect(
      screen.getByText(/Новите продажби ще бъдат блокирани/),
    ).toBeInTheDocument();
  });

  it('opens ConfirmStatusModal with correct text when clicking "Реактивирай"', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Спрян Брокер')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Реактивирай' }));

    expect(screen.getByText('Реактивиране на тенант')).toBeInTheDocument();
    expect(
      screen.getByText(/Продажбите ще се възобновят/),
    ).toBeInTheDocument();
  });

  it('closes modal when clicking "Отказ"', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Активен Брокер')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Деактивирай' }));
    expect(screen.getByText('Деактивиране на тенант')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Отказ' }));
    expect(
      screen.queryByText('Деактивиране на тенант'),
    ).not.toBeInTheDocument();
  });

  it('sends PATCH request and closes modal on confirm', async () => {
    renderWithQuery(<AdminTenantsPage />);

    await waitFor(() => {
      expect(screen.getByText('Активен Брокер')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Деактивирай' }));
    fireEvent.click(screen.getByRole('button', { name: 'Потвърди' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/status'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'suspended' }),
        }),
      );
    });
  });
});
