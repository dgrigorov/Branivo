'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface InsurerApiStatus {
  insurerId: string;
  insurerName: string;
  insurerCode: string;
  circuitState: 'open' | 'half-open' | 'closed';
  errorRate5min: number;
  avgLatencyMs: number;
  totalCalls5min: number;
  isManuallyDisabled: boolean;
  disabledReason: string | null;
}

const CIRCUIT_STATE_STYLES: Record<
  InsurerApiStatus['circuitState'],
  string
> = {
  open: 'bg-red-100 text-red-700',
  'half-open': 'bg-yellow-100 text-yellow-700',
  closed: 'bg-green-100 text-green-700',
};

const CIRCUIT_STATE_LABELS: Record<InsurerApiStatus['circuitState'], string> =
  {
    open: 'Open',
    'half-open': 'Half-Open',
    closed: 'Closed',
  };

async function fetchInsurerMonitor(): Promise<InsurerApiStatus[]> {
  const res = await fetch('/api/v1/admin/insurers/monitor', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch insurer status');
  return res.json() as Promise<InsurerApiStatus[]>;
}

async function disableInsurer(id: string, reason: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/insurers/${id}/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  });
  if (res.status !== 204 && !res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Грешка при деактивиране');
  }
}

async function enableInsurer(id: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/insurers/${id}/enable`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status !== 204 && !res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Грешка при активиране');
  }
}

interface DisableModalState {
  insurerId: string;
  insurerName: string;
  reason: string;
}

export default function AdminInsurersPage() {
  const queryClient = useQueryClient();
  const [disableModal, setDisableModal] = useState<DisableModalState | null>(
    null,
  );

  const { data, isLoading, error } = useQuery<InsurerApiStatus[]>({
    queryKey: ['admin', 'insurers', 'monitor'],
    queryFn: fetchInsurerMonitor,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const disableMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      disableInsurer(id, reason),
    onSuccess: () => {
      setDisableModal(null);
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'insurers', 'monitor'],
      });
    },
  });

  const [enableError, setEnableError] = useState<string | null>(null);

  const enableMutation = useMutation({
    mutationFn: (id: string) => enableInsurer(id),
    onSuccess: () => {
      setEnableError(null);
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'insurers', 'monitor'],
      });
    },
    onError: (err: unknown) => {
      setEnableError(err instanceof Error ? err.message : 'Грешка при активиране');
    },
  });

  const handleDisableConfirm = () => {
    if (!disableModal || !disableModal.reason.trim()) return;
    disableMutation.mutate({
      id: disableModal.insurerId,
      reason: disableModal.reason,
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Зареждане...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">Грешка при зареждане на застрахователи</p>
      </div>
    );
  }

  const insurers = data ?? [];

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Застрахователи — API мониторинг</h1>
          <p className="mt-1 text-sm text-gray-500">
            Обновява се автоматично на всеки 30 секунди
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Застраховател
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Circuit Breaker
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Error Rate (5мин)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Avg Latency
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Заявки (5мин)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Статус
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Действие
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {insurers.map((ins) => (
              <tr
                key={ins.insurerId}
                className={ins.isManuallyDisabled ? 'bg-gray-100' : ''}
              >
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {ins.insurerName}
                  </div>
                  <div className="text-xs text-gray-400">{ins.insurerCode}</div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${CIRCUIT_STATE_STYLES[ins.circuitState]}`}
                  >
                    {CIRCUIT_STATE_LABELS[ins.circuitState]}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`text-sm ${ins.errorRate5min > 1 ? 'font-medium text-red-600' : 'text-gray-700'}`}
                  >
                    {ins.errorRate5min.toFixed(2)}%
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {ins.avgLatencyMs} ms
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {ins.totalCalls5min}
                </td>
                <td className="px-6 py-4">
                  {ins.isManuallyDisabled ? (
                    <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-gray-200 text-gray-600">
                      Деактивиран
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-green-100 text-green-700">
                      Активен
                    </span>
                  )}
                  {ins.disabledReason && (
                    <div className="mt-1 text-xs text-gray-500">
                      {ins.disabledReason}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {ins.isManuallyDisabled ? (
                    <div>
                      <button
                        onClick={() => {
                          setEnableError(null);
                          enableMutation.mutate(ins.insurerId);
                        }}
                        disabled={enableMutation.isPending}
                        className="rounded border border-green-300 px-3 py-1 text-xs font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
                      >
                        Активирай
                      </button>
                      {enableError && (
                        <p className="mt-1 text-xs text-red-600">{enableError}</p>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        setDisableModal({
                          insurerId: ins.insurerId,
                          insurerName: ins.insurerName,
                          reason: '',
                        })
                      }
                      className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Деактивирай
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Disable Confirm Modal */}
      {disableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">
              Деактивирай застраховател
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              Сигурни ли сте, че искате да деактивирате{' '}
              <strong>{disableModal.insurerName}</strong>? Заявките към него ще
              спрат незабавно.
            </p>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Причина <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={disableModal.reason}
              onChange={(e) =>
                setDisableModal((prev) =>
                  prev ? { ...prev, reason: e.target.value } : null,
                )
              }
              placeholder="напр. API деградация, висок error rate..."
              className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              maxLength={500}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDisableModal(null)}
                disabled={disableMutation.isPending}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Отказ
              </button>
              <button
                onClick={handleDisableConfirm}
                disabled={
                  !disableModal.reason.trim() || disableMutation.isPending
                }
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {disableMutation.isPending
                  ? 'Деактивиране...'
                  : 'Потвърди деактивиране'}
              </button>
            </div>
            {disableMutation.error && (
              <p className="mt-2 text-sm text-red-600">
                {disableMutation.error instanceof Error
                  ? disableMutation.error.message
                  : 'Грешка при деактивиране'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
