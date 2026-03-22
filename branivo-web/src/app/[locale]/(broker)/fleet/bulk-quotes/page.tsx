'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { BulkPurchaseResult } from '@/components/fleet/BulkPurchaseResult';
import type { BulkPurchaseResultProps } from '@/components/fleet/BulkPurchaseResult';

type BulkVehicleQuoteStatus = 'success' | 'partial' | 'failed';

interface QuoteOffer {
  id: string;
  insurerCode: string;
  insurerName: string;
  price: number | null;
  currency: string;
  score: number | null;
  isRecommended: boolean;
  status: 'success' | 'error';
  errorReason?: string;
}

interface VehicleQuoteResult {
  vehicleId: string;
  licensePlate: string;
  make: string;
  model: string;
  sessionToken: string;
  status: BulkVehicleQuoteStatus;
  offers: QuoteOffer[];
}

interface BulkQuoteResponse {
  results: VehicleQuoteResult[];
}

interface BulkPurchaseItem {
  vehicleId: string;
  quoteId: string;
}

type BulkPurchaseResponse = BulkPurchaseResultProps;

async function fetchBulkQuotes(vehicleIds: string[]): Promise<BulkQuoteResponse> {
  const res = await fetch('/api/v1/fleet/bulk-quotes', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleIds }),
  });
  if (!res.ok) throw new Error('Грешка при зареждане на офертите');
  return res.json() as Promise<BulkQuoteResponse>;
}

async function submitBulkPurchase(
  items: BulkPurchaseItem[],
): Promise<BulkPurchaseResponse> {
  const res = await fetch('/api/v1/fleet/bulk-purchase', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error('Грешка при закупуване на полиците');
  return res.json() as Promise<BulkPurchaseResponse>;
}

function statusLabel(status: BulkVehicleQuoteStatus) {
  if (status === 'success') return '✅ Успешно';
  if (status === 'partial') return '⚠️ Частично';
  return '❌ Неуспешно';
}

function statusBg(status: BulkVehicleQuoteStatus) {
  if (status === 'success') return 'bg-green-50 border-green-200';
  if (status === 'partial') return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

export default function BulkQuotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vehicleIdsParam = searchParams.get('vehicleIds') ?? '';
  const vehicleIds = vehicleIdsParam
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const [quoteData, setQuoteData] = useState<BulkQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [selectedOffers, setSelectedOffers] = useState<Record<string, string>>({});
  const [purchaseResult, setPurchaseResult] = useState<BulkPurchaseResponse | null>(null);

  // POST to bulk-quotes on mount — useMutation is correct for POST
  const quoteMutation = useMutation<BulkQuoteResponse, Error, string[]>({
    mutationFn: fetchBulkQuotes,
    onMutate: () => {
      setQuoteLoading(true);
      setQuoteError(null);
    },
    onSuccess: (data) => {
      setQuoteData(data);
      setQuoteLoading(false);
      // Pre-select recommended offer for each vehicle
      const autoSelected: Record<string, string> = {};
      for (const result of data.results) {
        const recommended = result.offers.find(
          (o) => o.isRecommended && o.status === 'success' && o.price !== null,
        );
        if (recommended) {
          autoSelected[result.vehicleId] = recommended.id;
        }
      }
      setSelectedOffers(autoSelected);
    },
    onError: (err) => {
      setQuoteError(err.message);
      setQuoteLoading(false);
    },
  });

  useEffect(() => {
    if (vehicleIds.length > 0) {
      quoteMutation.mutate(vehicleIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleIdsParam]);

  const purchaseMutation = useMutation<BulkPurchaseResponse, Error, BulkPurchaseItem[]>({
    mutationFn: submitBulkPurchase,
    onSuccess: (result) => {
      setPurchaseResult(result);
    },
  });

  function selectOffer(vehicleId: string, quoteId: string) {
    setSelectedOffers((prev) => ({ ...prev, [vehicleId]: quoteId }));
  }

  function handlePurchase() {
    const items: BulkPurchaseItem[] = Object.entries(selectedOffers).map(
      ([vehicleId, quoteId]) => ({ vehicleId, quoteId }),
    );
    purchaseMutation.mutate(items);
  }

  function handleRetry(
    failedItems: BulkPurchaseResultProps['failed'],
  ) {
    purchaseMutation.mutate(
      failedItems.map((f) => ({ vehicleId: f.vehicleId, quoteId: f.quoteId })),
    );
    setPurchaseResult(null);
  }

  const selectedCount = Object.keys(selectedOffers).length;
  const hasSuccessfulResults =
    (quoteData?.results ?? []).some((r) => r.status !== 'failed') ?? false;

  if (vehicleIds.length === 0) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Не са избрани МПС.</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-blue-600 hover:underline text-sm"
        >
          ← Назад към флота
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:underline text-sm"
        >
          ← Назад
        </button>
        <h1 className="text-2xl font-semibold">Оферти за флота</h1>
      </div>

      {quoteLoading && (
        <div className="p-8 text-gray-500 text-center">
          Зареждане на оферти от застрахователите...
        </div>
      )}

      {quoteError && (
        <div className="p-6 text-red-500">{quoteError}</div>
      )}

      {purchaseResult && (
        <div className="mb-6">
          <BulkPurchaseResult
            succeeded={purchaseResult.succeeded}
            failed={purchaseResult.failed}
            summary={purchaseResult.summary}
            onRetry={purchaseResult.failed.length > 0 ? handleRetry : undefined}
          />
        </div>
      )}

      {quoteData && (
        <>
          <div className="space-y-4 mb-6">
            {quoteData.results.map((result) => (
              <div
                key={result.vehicleId}
                className={`border rounded-lg p-4 ${statusBg(result.status)}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-mono font-semibold text-gray-900">
                      {result.licensePlate}
                    </span>
                    <span className="ml-2 text-gray-600 text-sm">
                      {result.make} {result.model}
                    </span>
                  </div>
                  <span className="text-sm font-medium">
                    {statusLabel(result.status)}
                  </span>
                </div>

                {result.offers.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {result.offers
                      .filter((o) => o.status === 'success' && o.price !== null)
                      .map((offer) => (
                        <button
                          key={offer.id}
                          onClick={() =>
                            selectOffer(result.vehicleId, offer.id)
                          }
                          className={`text-left p-3 rounded border transition-colors ${
                            selectedOffers[result.vehicleId] === offer.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-white hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              {offer.insurerName}
                            </span>
                            {offer.isRecommended && (
                              <span className="text-xs text-blue-600 font-medium">
                                Препоръчана
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-lg font-semibold text-gray-900">
                            {offer.price} {offer.currency}
                          </div>
                        </button>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Няма налични оферти
                  </p>
                )}
              </div>
            ))}
          </div>

          {hasSuccessfulResults && (
            <div className="flex items-center gap-4">
              <button
                onClick={handlePurchase}
                disabled={
                  selectedCount === 0 || purchaseMutation.isPending
                }
                className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {purchaseMutation.isPending
                  ? 'Обработване...'
                  : `Закупи ${selectedCount > 0 ? `(${selectedCount})` : ''}`}
              </button>
              {selectedCount > 0 && (
                <span className="text-sm text-gray-500">
                  {selectedCount} МПС с избрана оферта
                </span>
              )}
            </div>
          )}

          {purchaseMutation.isError && (
            <p className="mt-3 text-sm text-red-500">
              {purchaseMutation.error.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
