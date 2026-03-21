'use client';

import { useState, useEffect } from 'react';

interface PolicyDocument {
  id: string;
  policyNumber: string;
  status: string;
  premiumAmount: number;
  currency: string;
  coverageStartDate?: string;
  coverageEndDate?: string;
}

interface PolicyDocumentUrls {
  policyPdfUrl: string;
  greenCardUrl: string;
  expiresAt: string;
}

async function fetchPolicies(token: string): Promise<PolicyDocument[]> {
  const res = await fetch('/api/v1/policies', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to load policies');
  const body = (await res.json()) as { data: PolicyDocument[] };
  return body.data ?? [];
}

async function fetchDocumentUrls(
  policyId: string,
  token: string,
): Promise<PolicyDocumentUrls> {
  const res = await fetch(`/api/v1/policies/${policyId}/documents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Documents not yet available');
  return res.json() as Promise<PolicyDocumentUrls>;
}

export default function PolicyWalletPage() {
  const [policies, setPolicies] = useState<PolicyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    const token =
      typeof window !== 'undefined'
        ? (localStorage.getItem('client_token') ?? '')
        : '';
    fetchPolicies(token)
      .then(setPolicies)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const openDocument = async (policyId: string, type: 'policy' | 'green-card') => {
    setOpeningId(`${policyId}-${type}`);
    try {
      const token = localStorage.getItem('client_token') ?? '';
      const urls = await fetchDocumentUrls(policyId, token);
      const url = type === 'policy' ? urls.policyPdfUrl : urls.greenCardUrl;
      window.open(url, '_blank');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Грешка при зареждане';
      setError(message);
    } finally {
      setOpeningId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-red-700"
        >
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">Моите полици</h1>

      {policies.length === 0 ? (
        <p className="text-gray-500">Нямате активни полици.</p>
      ) : (
        <ul className="space-y-4">
          {policies.map((policy) => (
            <li
              key={policy.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">{policy.policyNumber}</span>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  {policy.status}
                </span>
              </div>
              <p className="mb-1 text-sm text-gray-600">
                {policy.premiumAmount} {policy.currency}
              </p>
              {policy.coverageStartDate && policy.coverageEndDate && (
                <p className="mb-3 text-xs text-gray-400">
                  {policy.coverageStartDate} — {policy.coverageEndDate}
                </p>
              )}
              <p className="mb-2 text-xs text-gray-400">
                Линкът е валиден 15 мин след зареждане
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void openDocument(policy.id, 'policy')}
                  disabled={openingId === `${policy.id}-policy`}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {openingId === `${policy.id}-policy`
                    ? 'Зарежда...'
                    : 'Изтегли Полица'}
                </button>
                <button
                  onClick={() => void openDocument(policy.id, 'green-card')}
                  disabled={openingId === `${policy.id}-green-card`}
                  className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {openingId === `${policy.id}-green-card`
                    ? 'Зарежда...'
                    : 'Изтегли Зелена карта'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
