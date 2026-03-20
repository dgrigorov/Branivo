import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OcrAnalyticsPage from '@/app/[locale]/(admin)/ocr-analytics/page';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockAnalyticsResponse = {
  stats: [
    { fieldName: 'license_plate', avgConfidence: 0.97, fallbackRate: 0.05, totalJobs: 100 },
    { fieldName: 'vin', avgConfidence: 0.70, fallbackRate: 0.25, totalJobs: 80 },
  ],
  days: 7,
  generatedAt: new Date().toISOString(),
};

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

describe('OcrAnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders stats table with field names and confidence values', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAnalyticsResponse,
    });

    renderWithQuery(<OcrAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('license_plate')).toBeInTheDocument();
      expect(screen.getByText('vin')).toBeInTheDocument();
    });

    expect(screen.getByText('97.0%')).toBeInTheDocument();
    expect(screen.getByText('70.0%')).toBeInTheDocument();
  });

  it('shows alert banner when any field has fallback rate > 20%', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAnalyticsResponse,
    });

    renderWithQuery(<OcrAnalyticsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/fallback rate > 20%/i),
      ).toBeInTheDocument();
    });
  });

  it('does NOT show alert banner when all fallback rates <= 20%', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...mockAnalyticsResponse,
        stats: [
          { fieldName: 'license_plate', avgConfidence: 0.97, fallbackRate: 0.10, totalJobs: 100 },
        ],
      }),
    });

    renderWithQuery(<OcrAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('license_plate')).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/fallback rate > 20%/i),
    ).not.toBeInTheDocument();
  });

  it('shows red badge for high fallback rate field and green for normal', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAnalyticsResponse,
    });

    renderWithQuery(<OcrAnalyticsPage />);

    await waitFor(() => {
      const badges = screen.getAllByText(/\d+\.\d+%/);
      const vinFallbackBadge = badges.find((el) => el.textContent === '25.0%');
      expect(vinFallbackBadge).toHaveClass('bg-red-100');

      const lPlateFallbackBadge = badges.find((el) => el.textContent === '5.0%');
      expect(lPlateFallbackBadge).toHaveClass('bg-green-100');
    });
  });
});
