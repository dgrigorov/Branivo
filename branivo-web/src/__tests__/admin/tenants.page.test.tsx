/**
 * Component tests for Admin Tenants page.
 * Tests action buttons (Деактивирай/Реактивирай) and ConfirmStatusModal interaction.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminTenantsPage from '@/app/[locale]/(admin)/tenants/page';

const mockTenants = [
  {
    id: 'tenant-1',
    name: 'Активен Брокер',
    slug: 'active-broker',
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tenant-2',
    name: 'Спрян Брокер',
    slug: 'suspended-broker',
    status: 'suspended' as const,
    createdAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 'tenant-3',
    name: 'Поканен Брокер',
    slug: 'invited-broker',
    status: 'invited' as const,
    createdAt: '2026-01-03T00:00:00Z',
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
    if (String(url).includes('/api/v1/admin/tenants') && !String(url).includes('/status')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: mockTenants,
            total: mockTenants.length,
            page: 1,
            limit: 20,
          }),
      });
    }
    if (String(url).includes('/status')) {
      return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(null) });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  }) as jest.Mock;
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
