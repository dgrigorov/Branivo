import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useOcrAnalytics, useOcrTrend } from '@/lib/hooks/use-ocr-analytics';
import type { OcrAnalyticsResponse, OcrTrendPoint } from '@/lib/hooks/use-ocr-analytics';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockAnalyticsResponse: OcrAnalyticsResponse = {
  stats: [
    { fieldName: 'license_plate', avgConfidence: 0.97, fallbackRate: 0.05, totalJobs: 100 },
    { fieldName: 'vin', avgConfidence: 0.70, fallbackRate: 0.25, totalJobs: 80 },
  ],
  days: 7,
  generatedAt: new Date().toISOString(),
};

const mockTrendResponse: OcrTrendPoint[] = [
  { date: '2026-03-13', avgConfidence: 0.90, fallbackRate: 0.10, totalJobs: 20 },
  { date: '2026-03-14', avgConfidence: 0.85, fallbackRate: 0.15, totalJobs: 25 },
];

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
}

describe('useOcrAnalytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getAnalytics — returns stats on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAnalyticsResponse,
    });

    const { result } = renderHook(() => useOcrAnalytics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.stats).toHaveLength(2);
    expect(result.current.data?.days).toBe(7);
  });

  it('getAnalytics — returns error on HTTP failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    });

    const { result } = renderHook(() => useOcrAnalytics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toContain('500');
  });

  it('getAnalytics — passes filters to fetch URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAnalyticsResponse,
    });

    const { result } = renderHook(
      () => useOcrAnalytics({ tenantId: 'tenant-uuid-1', days: 30 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const callUrl = String((mockFetch.mock.calls[0] as [string])[0]);
    expect(callUrl).toContain('tenantId=tenant-uuid-1');
    expect(callUrl).toContain('days=30');
  });
});

describe('useOcrTrend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getTrend — returns trend points on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockTrendResponse,
    });

    const { result } = renderHook(() => useOcrTrend('vin', 7), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].date).toBe('2026-03-13');
  });

  it('getTrend — is disabled when field is empty', () => {
    const { result } = renderHook(() => useOcrTrend(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });
});
