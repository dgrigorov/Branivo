'use client';

import { useQuery } from '@tanstack/react-query';

export interface OcrFieldStat {
  fieldName: string;
  avgConfidence: number;
  fallbackRate: number;
  totalJobs: number;
}

export interface OcrAnalyticsResponse {
  stats: OcrFieldStat[];
  tenantId?: string;
  days: number;
  generatedAt: string;
}

export interface OcrTrendPoint {
  date: string;
  avgConfidence: number;
  fallbackRate: number;
  totalJobs: number;
}

export interface OcrAnalyticsFilters {
  tenantId?: string;
  days?: 7 | 30;
}

async function fetchAnalytics(
  filters?: OcrAnalyticsFilters,
): Promise<OcrAnalyticsResponse> {
  const params = new URLSearchParams();
  if (filters?.tenantId) params.set('tenantId', filters.tenantId);
  if (filters?.days) params.set('days', String(filters.days));

  const url = `/api/v1/ocr/analytics${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to fetch OCR analytics: ${res.status}`);
  }
  return res.json() as Promise<OcrAnalyticsResponse>;
}

async function fetchTrend(
  field: string,
  days?: 7 | 30,
  tenantId?: string,
): Promise<OcrTrendPoint[]> {
  const params = new URLSearchParams({ field });
  if (days) params.set('days', String(days));
  if (tenantId) params.set('tenantId', tenantId);

  const res = await fetch(`/api/v1/ocr/analytics/trend?${params.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch OCR trend: ${res.status}`);
  }
  return res.json() as Promise<OcrTrendPoint[]>;
}

export function useOcrAnalytics(filters?: OcrAnalyticsFilters) {
  return useQuery<OcrAnalyticsResponse, Error>({
    queryKey: ['ocr-analytics', filters],
    queryFn: () => fetchAnalytics(filters),
  });
}

export function useOcrTrend(
  field: string,
  days?: 7 | 30,
  tenantId?: string,
) {
  return useQuery<OcrTrendPoint[], Error>({
    queryKey: ['ocr-trend', field, days, tenantId],
    queryFn: () => fetchTrend(field, days, tenantId),
    enabled: !!field,
  });
}
