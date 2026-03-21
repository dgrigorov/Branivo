/**
 * Component tests for Broker Commission Dashboard page.
 * Tests skeleton loading, summary cards, policy list, pending badge, empty state.
 */
import '@testing-library/jest-dom';
import React from 'react';
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CommissionDashboardPage from '@/app/[locale]/(broker)/billing/page';

const mockFetch = jest.fn();
global.fetch = mockFetch;

interface CommissionDashboardResponse {
  data: {
    summary: {
      totalPolicies: number;
      totalPremium: number;
      totalCommission: number;
      currency: string;
    };
    byInsurer: {
      insurerId: string;
      insurerName: string;
      policiesCount: number;
      totalPremium: number;
      totalCommission: number;
    }[];
    policies: {
      id: string;
      insurerId: string;
      insurerName: string;
      productType: string;
      premiumAmount: number;
      commissionPct: number;
      commissionAmount: number;
      commissionStatus: 'confirmed' | 'pending';
      createdAt: string;
    }[];
  };
}

const mockDashboardData: CommissionDashboardResponse = {
  data: {
    summary: {
      totalPolicies: 2,
      totalPremium: 770,
      totalCommission: 36.9,
      currency: 'BGN',
    },
    byInsurer: [
      {
        insurerId: 'ins-1',
        insurerName: 'Allianz Bulgaria',
        policiesCount: 2,
        totalPremium: 770,
        totalCommission: 36.9,
      },
    ],
    policies: [
      {
        id: 'pol-1',
        insurerId: 'ins-1',
        insurerName: 'Allianz Bulgaria',
        productType: 'GO',
        premiumAmount: 450,
        commissionPct: 0.05,
        commissionAmount: 22.5,
        commissionStatus: 'confirmed',
        createdAt: '2026-03-01T10:00:00.000Z',
      },
      {
        id: 'pce-1',
        insurerId: 'ins-1',
        insurerName: 'Allianz Bulgaria',
        productType: 'GO',
        premiumAmount: 320,
        commissionPct: 0.045,
        commissionAmount: 14.4,
        commissionStatus: 'pending',
        createdAt: '2026-03-15T12:00:00.000Z',
      },
    ],
  },
};

const emptyDashboardData: CommissionDashboardResponse = {
  data: {
    summary: { totalPolicies: 0, totalPremium: 0, totalCommission: 0, currency: 'BGN' },
    byInsurer: [],
    policies: [],
  },
};

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe('CommissionDashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the page heading', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => emptyDashboardData,
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    expect(screen.getByText('Комисионен Dashboard')).toBeInTheDocument();
  });

  it('shows skeleton loading rows while data is loading', () => {
    // Keep fetch pending
    mockFetch.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<CommissionDashboardPage />);

    const skeletonDivs = document.querySelectorAll('.animate-pulse');
    expect(skeletonDivs.length).toBeGreaterThan(0);
  });

  it('shows summary cards with correct values after loading', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockDashboardData,
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('Обща премия')).toBeInTheDocument();
    expect(screen.getByText('Обща комисиона')).toBeInTheDocument();
    expect(screen.getByText('Общо полици')).toBeInTheDocument();
  });

  it('shows policy list rows after loading', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockDashboardData,
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Allianz Bulgaria')).not.toHaveLength(0);
    });
  });

  it('shows "Потвърден" badge for confirmed status', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockDashboardData,
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Потвърден')).toBeInTheDocument();
    });
  });

  it('shows "Обработва се" badge for pending status', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockDashboardData,
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Обработва се')).toBeInTheDocument();
    });
  });

  it('shows empty state message when no policies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => emptyDashboardData,
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Няма комисиони за избрания период'),
      ).toBeInTheDocument();
    });
  });

  it('shows error message when API fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Грешка при зареждане на данните'),
      ).toBeInTheDocument();
    });
  });

  it('shows date filter inputs', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => emptyDashboardData,
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    expect(screen.getByLabelText('От дата')).toBeInTheDocument();
    expect(screen.getByLabelText('До дата')).toBeInTheDocument();
  });

  it('insurer dropdown selection updates the query filter', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockDashboardData,
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Allianz Bulgaria' }),
      ).toBeInTheDocument();
    });

    const dropdown = screen.getByLabelText('Застраховател') as HTMLSelectElement;
    fireEvent.change(dropdown, { target: { value: 'ins-1' } });

    // Second fetch call should include insurerId in URL
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
      const lastUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string;
      expect(lastUrl).toContain('insurerId=ins-1');
    });
  });

  it('shows insurer dropdown with "Всички" default option', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockDashboardData,
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Застраховател')).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: 'Allianz Bulgaria' }),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('option', { name: 'Всички' })).toBeInTheDocument();
  });

  it('highlights selected policy row on click', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockDashboardData,
    } as unknown as Response);

    renderWithQuery(<CommissionDashboardPage />);

    // Wait for policies to render
    let confirmedBadge: HTMLElement;
    await waitFor(() => {
      confirmedBadge = screen.getByText('Потвърден');
      expect(confirmedBadge).toBeInTheDocument();
    });

    // Click the row containing the "Потвърден" badge
    const policyRow = confirmedBadge!.closest('tr');
    expect(policyRow).not.toBeNull();
    fireEvent.click(policyRow!);

    // Row should receive selected styling (bg-blue-50)
    await waitFor(() => {
      expect(policyRow!.className).toContain('bg-blue-50');
    });
  });
});
