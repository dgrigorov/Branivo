'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

type ProductType = 'GO' | 'KASKO' | 'PROPERTY';

interface CommissionEntry {
  insurerId: string;
  insurerName: string;
  productType: ProductType;
  ratePct: number;
  updatedAt: string;
}

interface CommissionsResponse {
  data: CommissionEntry[];
  meta: { timestamp: string };
}

interface UpsertResponse {
  data: CommissionEntry;
  meta: { timestamp: string };
}

async function fetchCommissions(): Promise<CommissionEntry[]> {
  const res = await fetch('/api/v1/admin/commissions', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Грешка при зареждане на комисионни');
  const body = await res.json() as CommissionsResponse;
  return body.data;
}

async function upsertCommission(
  insurerId: string,
  productType: ProductType,
  ratePct: number,
): Promise<CommissionEntry> {
  const res = await fetch(
    `/api/v1/admin/commissions/${insurerId}/${productType}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ productType, ratePct }),
    },
  );
  if (!res.ok) {
    const body = await res.json() as { message?: string };
    throw new Error(body.message ?? 'Грешка при запис на ставка');
  }
  const body = await res.json() as UpsertResponse;
  return body.data;
}

interface EditState {
  insurerId: string;
  productType: ProductType;
  value: string;
}

export default function CommissionsPage() {
  const [editState, setEditState] = useState<EditState | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'commissions'],
    queryFn: fetchCommissions,
    staleTime: 60_000,
  });

  const upsertMutation = useMutation({
    mutationFn: ({
      insurerId,
      productType,
      ratePct,
    }: {
      insurerId: string;
      productType: ProductType;
      ratePct: number;
    }) => upsertCommission(insurerId, productType, ratePct),
    onSuccess: () => {
      setEditState(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'commissions'] });
    },
  });

  const handleSave = () => {
    if (!editState) return;
    const ratePct = parseFloat(editState.value) / 100;
    if (isNaN(ratePct) || ratePct < 0 || ratePct > 1) return;
    upsertMutation.mutate({
      insurerId: editState.insurerId,
      productType: editState.productType,
      ratePct,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-semibold">Комисионна матрица</h1>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Застраховател', 'Продукт', 'Ставка %', 'Последна промяна', 'Действие'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {[1, 2, 3].map((i) => (
                <tr key={i}>
                  {[1, 2, 3, 4, 5].map((j) => (
                    <td key={j} className="px-6 py-4">
                      <div className="h-4 animate-pulse rounded bg-gray-200" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">Грешка при зареждане на комисионната матрица</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-semibold">Комисионна матрица</h1>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Застраховател
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Продукт
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Ставка %
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Последна промяна
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Действие
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                  Няма конфигурирани комисионни ставки
                </td>
              </tr>
            )}
            {data?.map((entry) => {
              const isEditing =
                editState?.insurerId === entry.insurerId &&
                editState.productType === entry.productType;

              return (
                <tr key={`${entry.insurerId}-${entry.productType}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {entry.insurerName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {entry.productType}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        className="w-24 rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={editState.value}
                        onChange={(e) =>
                          setEditState({ ...editState, value: e.target.value })
                        }
                        autoFocus
                      />
                    ) : (
                      `${(entry.ratePct * 100).toFixed(2)}%`
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(entry.updatedAt).toLocaleDateString('bg-BG')}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          onClick={handleSave}
                          disabled={upsertMutation.isPending}
                          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {upsertMutation.isPending ? 'Записва...' : 'Запази'}
                        </button>
                        <button
                          onClick={() => setEditState(null)}
                          disabled={upsertMutation.isPending}
                          className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Отказ
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          setEditState({
                            insurerId: entry.insurerId,
                            productType: entry.productType,
                            value: (entry.ratePct * 100).toFixed(2),
                          })
                        }
                        className="rounded border border-blue-300 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        Редактирай
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {upsertMutation.isError && (
        <p className="mt-4 text-sm text-red-600">
          {upsertMutation.error instanceof Error
            ? upsertMutation.error.message
            : 'Грешка при запис'}
        </p>
      )}
    </div>
  );
}
