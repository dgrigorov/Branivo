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

export interface OcrFieldDto {
  value: string | null;
  confidence: number;
  autoFilled: boolean;
}

export interface OcrFieldResultDto {
  license_plate?: OcrFieldDto;
  vin?: OcrFieldDto;
  cert_number?: OcrFieldDto;
  make?: OcrFieldDto;
  model?: OcrFieldDto;
  year?: OcrFieldDto;
  color?: OcrFieldDto;
  engine_volume?: OcrFieldDto;
  fuel_type?: OcrFieldDto;
  first_registration_date?: OcrFieldDto;
  owner_name?: OcrFieldDto;
  owner_egn?: OcrFieldDto;
  owner_address?: OcrFieldDto;
}

export interface OcrSessionDto {
  id: string;
  sessionToken: string;
  tenantId: string;
  provider: string | null;
  status: string;
  imagesCount: number;
  result: OcrFieldResultDto | null;
  confidenceScores: Record<string, number> | null;
  createdAt: string;
}

export interface OcrSessionsResponse {
  sessions: OcrSessionDto[];
  total: number;
  page: number;
  limit: number;
}

export interface OcrSessionsFilters {
  tenantId?: string;
  days?: 7 | 30;
  page?: number;
  limit?: 10 | 25 | 50;
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

async function fetchSessions(
  filters?: OcrSessionsFilters,
): Promise<OcrSessionsResponse> {
  const params = new URLSearchParams();
  if (filters?.tenantId) params.set('tenantId', filters.tenantId);
  if (filters?.days) params.set('days', String(filters.days));
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));

  const url = `/api/v1/ocr/analytics/sessions${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to fetch OCR sessions: ${res.status}`);
  }
  return res.json() as Promise<OcrSessionsResponse>;
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

export function useOcrSessions(filters?: OcrSessionsFilters) {
  return useQuery<OcrSessionsResponse, Error>({
    queryKey: ['ocr-sessions', filters],
    queryFn: () => fetchSessions(filters),
  });
}
