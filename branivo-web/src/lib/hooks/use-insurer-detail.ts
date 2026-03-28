'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface InsurerFscData {
  trustpilotScore: number | null;
  trustpilotReviewsCount: number | null;
  trustpilotUrl: string | null;
  website: string | null;
  officeAddress: string | null;
  contactPhone: string | null;
  contactEmails: string[];
  socialLinks: string[];
  logoUrl: string | null;
  longDescription: string | null;
}

export interface InsurerDetail {
  insurerId: string;
  name: string;
  code: string;
  isActive: boolean;
  isManuallyDisabled: boolean;
  disabledReason: string | null;
  rating: number;
  claimSpeed: number;
  extrasConfig: Record<string, unknown>;
  adapterClass: string;
  apiEndpoint: string | null;
  fscInsurerId: string | null;
  logoUrl: string | null;
  description: string | null;
  fsc: InsurerFscData | null;
  circuitState: string;
  errorRate5min: number;
  avgLatencyMs: number;
  totalCalls5min: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  message: string;
}

async function fetchInsurerDetail(id: string): Promise<InsurerDetail> {
  const res = await fetch(`/api/v1/admin/insurers/${id}`);
  if (!res.ok) throw new Error('Failed to load insurer detail');
  return res.json() as Promise<InsurerDetail>;
}

async function updateConfig(
  id: string,
  payload: Partial<InsurerDetail>,
): Promise<InsurerDetail> {
  const res = await fetch(`/api/v1/admin/insurers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update insurer config');
  return res.json() as Promise<InsurerDetail>;
}

async function setApiKey(id: string, apiKey: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/insurers/${id}/api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok && res.status !== 204) throw new Error('Failed to set API key');
}

async function testConnection(id: string): Promise<TestConnectionResult> {
  const res = await fetch(`/api/v1/admin/insurers/${id}/test`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Test connection request failed');
  return res.json() as Promise<TestConnectionResult>;
}

export function useInsurerDetail(id: string) {
  const queryClient = useQueryClient();
  const queryKey = ['insurer-detail', id];

  const detailQuery = useQuery({
    queryKey,
    queryFn: () => fetchInsurerDetail(id),
    staleTime: 30_000,
  });

  const updateConfigMutation = useMutation({
    mutationFn: (payload: Partial<InsurerDetail>) => updateConfig(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
    },
  });

  const setApiKeyMutation = useMutation({
    mutationFn: (apiKey: string) => setApiKey(id, apiKey),
  });

  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const runTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(id);
      setTestResult(result);
    } finally {
      setIsTesting(false);
    }
  };

  return {
    insurer: detailQuery.data,
    isLoading: detailQuery.isLoading,
    error: detailQuery.error,
    updateConfig: updateConfigMutation.mutateAsync,
    isUpdating: updateConfigMutation.isPending,
    setApiKey: setApiKeyMutation.mutateAsync,
    isSettingKey: setApiKeyMutation.isPending,
    runTest,
    isTesting,
    testResult,
  };
}
