import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminBillingPage from '@/app/[locale]/(admin)/billing-runs/page';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('AdminBillingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the page heading and billing run button', () => {
    renderWithQuery(<AdminBillingPage />);

    expect(screen.getByText('Admin — Monthly Billing')).toBeInTheDocument();
    expect(screen.getByText('Run Billing for All Tenants')).toBeInTheDocument();
  });

  it('renders tenant ID input and run-for-tenant button', () => {
    renderWithQuery(<AdminBillingPage />);

    expect(
      screen.getByPlaceholderText('Tenant UUID (optional)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Run for Tenant')).toBeInTheDocument();
  });

  it('renders recent invoices table', () => {
    renderWithQuery(<AdminBillingPage />);

    expect(screen.getByText('Recent Invoices')).toBeInTheDocument();
    expect(screen.getAllByText('paid')).toHaveLength(2);
  });

  it('shows success message after successful billing run', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Billing run initiated' }),
    });

    renderWithQuery(<AdminBillingPage />);

    fireEvent.click(screen.getByText('Run Billing for All Tenants'));

    await waitFor(() => {
      expect(screen.getByText('Billing run initiated')).toBeInTheDocument();
    });
  });

  it('shows loading state while mutation is pending', async () => {
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    renderWithQuery(<AdminBillingPage />);

    fireEvent.click(screen.getByText('Run Billing for All Tenants'));

    await waitFor(() => {
      expect(screen.getByText('Running…')).toBeInTheDocument();
    });

    resolveFetch({
      ok: true,
      json: async () => ({ message: 'Billing run initiated' }),
    });
  });

  it('shows error message when billing run fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    });

    renderWithQuery(<AdminBillingPage />);

    fireEvent.click(screen.getByText('Run Billing for All Tenants'));

    await waitFor(() => {
      expect(screen.getByText(/Error: Unauthorized/)).toBeInTheDocument();
    });
  });
});
