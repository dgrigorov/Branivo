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

interface ShipmentInfo {
  shipmentId: string;
  provider: 'speedy' | 'econt' | 'manual';
  trackingNumber: string | null;
  estimatedDeliveryDate: string | null;
  status: 'pending' | 'dispatched' | 'delivered' | 'failed';
  createdAt: string;
}

type WalletTab = 'active' | 'expired';

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

async function fetchShipment(
  policyId: string,
  token: string,
): Promise<ShipmentInfo | null> {
  const res = await fetch(`/api/v1/policies/${policyId}/shipment`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json() as Promise<ShipmentInfo>;
}

const SHIPMENT_STATUS_LABELS: Record<ShipmentInfo['status'], string> = {
  pending: 'Изчакване',
  dispatched: 'Изпратен',
  delivered: 'Доставен',
  failed: 'Неуспешен',
};

const PROVIDER_LABELS: Record<ShipmentInfo['provider'], string> = {
  speedy: 'Speedy',
  econt: 'Econt',
  manual: 'Ръчна обработка',
};

export default function PolicyWalletPage() {
  const [policies, setPolicies] = useState<PolicyDocument[]>([]);
  const [shipments, setShipments] = useState<Record<string, ShipmentInfo | null>>({});
  const [activeTab, setActiveTab] = useState<WalletTab>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    const token =
      typeof window !== 'undefined'
        ? (localStorage.getItem('client_token') ?? '')
        : '';

    fetchPolicies(token)
      .then(async (loadedPolicies) => {
        setPolicies(loadedPolicies);
        const shipmentResults = await Promise.all(
          loadedPolicies.map(async (p) => ({
            id: p.id,
            shipment: await fetchShipment(p.id, token),
          })),
        );
        const shipmentMap: Record<string, ShipmentInfo | null> = {};
        for (const { id, shipment } of shipmentResults) {
          shipmentMap[id] = shipment;
        }
        setShipments(shipmentMap);
      })
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

  const isExpiredPolicy = (policy: PolicyDocument): boolean => {
    if (!policy.coverageEndDate) return policy.status !== 'active';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const coverageEnd = new Date(policy.coverageEndDate);
    coverageEnd.setHours(0, 0, 0, 0);
    return coverageEnd < today;
  };

  const activePolicies = policies.filter((policy) => !isExpiredPolicy(policy));
  const expiredPolicies = policies.filter((policy) => isExpiredPolicy(policy));
  const visiblePolicies = activeTab === 'active' ? activePolicies : expiredPolicies;

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
      <div className="mb-4 flex w-fit rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setActiveTab('active')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            activeTab === 'active'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Активни ({activePolicies.length})
        </button>
        <button
          onClick={() => setActiveTab('expired')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            activeTab === 'expired'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Изтекли ({expiredPolicies.length})
        </button>
      </div>

      {visiblePolicies.length === 0 ? (
        <p className="text-gray-500">
          {activeTab === 'active'
            ? 'Нямате активни полици.'
            : 'Нямате изтекли полици.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {visiblePolicies.map((policy) => {
            const shipment = shipments[policy.id];
            const isExpired = isExpiredPolicy(policy);
            return (
              <li
                key={policy.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">{policy.policyNumber}</span>
                  {isExpired ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      изтекла
                    </span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      активна
                    </span>
                  )}
                </div>
                <p className="mb-1 text-sm text-gray-600">
                  {policy.premiumAmount} {policy.currency}
                </p>
                {policy.coverageStartDate && policy.coverageEndDate && (
                  <p className="mb-3 text-xs text-gray-400">
                    {policy.coverageStartDate} — {policy.coverageEndDate}
                  </p>
                )}

                {/* Sticker delivery tracking */}
                {shipment !== undefined && (
                  <div
                    data-testid="shipment-tracking"
                    className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3"
                  >
                    <p className="mb-1 text-xs font-semibold text-blue-800">
                      Доставка на стикер
                    </p>
                    {shipment === null ? (
                      <p className="text-xs text-gray-500">
                        Информация за доставката не е налична.
                      </p>
                    ) : shipment.provider === 'manual' ? (
                      <p className="text-xs text-amber-700">
                        Доставката ще бъде обработена ръчно от брокера.
                      </p>
                    ) : (
                      <div className="space-y-0.5 text-xs text-blue-700">
                        <p>
                          <span className="font-medium">Статус:</span>{' '}
                          {SHIPMENT_STATUS_LABELS[shipment.status]}
                        </p>
                        <p>
                          <span className="font-medium">Куриер:</span>{' '}
                          {PROVIDER_LABELS[shipment.provider]}
                        </p>
                        {shipment.trackingNumber && (
                          <p>
                            <span className="font-medium">Tracking №:</span>{' '}
                            {shipment.trackingNumber}
                          </p>
                        )}
                        {shipment.estimatedDeliveryDate && (
                          <p>
                            <span className="font-medium">Очаквана доставка:</span>{' '}
                            {shipment.estimatedDeliveryDate}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
