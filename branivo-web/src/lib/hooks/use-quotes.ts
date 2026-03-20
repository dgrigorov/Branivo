'use client';

import { useQuery } from '@tanstack/react-query';

export interface VehicleData {
  vin: string;
  licensePlate: string;
  make: string;
  model: string;
  year: number;
}

export interface QuoteOffer {
  id: string;
  insurerCode: string;
  insurerName: string;
  price: number | null;
  currency: string;
  score: number | null;
  isRecommended: boolean;
  status: 'pending' | 'success' | 'error' | 'timeout';
  extras: Record<string, unknown>;
  errorReason?: 'unavailable' | 'timeout';
}

export interface QuoteSession {
  sessionToken: string;
  offers: QuoteOffer[];
  status: 'pending' | 'complete';
  requestedAt: string;
}

interface QuoteApiResponse {
  data: QuoteSession;
  meta: { timestamp: string };
}

export async function createQuoteRequest(
  sessionToken: string,
  vehicleData?: VehicleData,
): Promise<QuoteSession> {
  const body: { sessionToken: string; vehicleData?: VehicleData } = {
    sessionToken,
  };
  if (vehicleData) body.vehicleData = vehicleData;

  const res = await fetch('/api/v1/quotes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': sessionToken,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to create quote request: HTTP ${res.status}`);
  }

  const json = (await res.json()) as QuoteApiResponse;
  return json.data;
}

async function fetchQuotesBySession(sessionToken: string): Promise<QuoteSession> {
  const res = await fetch(`/api/v1/quotes/${sessionToken}`, {
    headers: { 'X-Session-Token': sessionToken },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch quotes: HTTP ${res.status}`);
  }

  const json = (await res.json()) as QuoteApiResponse;
  return json.data;
}

export function useQuotesBySession(sessionToken: string) {
  return useQuery({
    queryKey: ['quotes', 'list', sessionToken],
    queryFn: () => fetchQuotesBySession(sessionToken),
    // MANDATORY — regulatory requirement (КФН): stale prices are not permitted
    staleTime: 0,
    gcTime: 0,
    enabled: !!sessionToken,
  });
}
