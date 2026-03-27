'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/hooks/use-current-user';

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

interface FscSyncResponse {
  total: number;
  byCategory: Array<{
    categoryKey: string;
    categoryLabel: string;
    url: string;
    imported: number;
  }>;
  syncedAt: string;
}

interface FscSyncStatusResponse {
  runId: string | null;
  status: 'idle' | 'running' | 'success' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  total: number | null;
  byCategory: Array<{
    categoryKey: string;
    categoryLabel: string;
    url: string;
    imported: number;
  }>;
  errorMessage: string | null;
  logs: Array<{
    at: string;
    level: 'info' | 'warn' | 'error';
    message: string;
  }>;
}

interface FscInsurerRecord {
  id: string;
  categoryKey: string;
  categoryLabel: string;
  name: string;
  eik: string | null;
  officeAddress: string | null;
  website: string | null;
  contactDetails: string | null;
  contactPhone: string | null;
  contactEmails: string[];
  longDescription: string | null;
  logoUrl: string | null;
  socialLinks: string[];
  trustpilotUrl: string | null;
  websiteEnrichedAt: string | null;
  sourceUrl: string;
  scrapedAt: string;
  updatedAt: string;
}

type FscCategoryKey =
  | 'life_insurers'
  | 'non_life_insurers'
  | 'insurance_brokers'
  | 'reinsurers';

const FSC_TABS: Array<{ key: FscCategoryKey; label: string }> = [
  { key: 'life_insurers', label: 'Животозастраховане' },
  { key: 'non_life_insurers', label: 'Общо застраховане' },
  { key: 'insurance_brokers', label: 'Брокери' },
  { key: 'reinsurers', label: 'Презастрахователи' },
];

function splitPhones(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(';')
    .map((phone) => phone.replace(/^тел\.?\s*/i, '').trim())
    .filter((phone) => phone.length > 0);
}

function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function socialLabel(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('facebook.com')) return 'Facebook';
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('linkedin.com')) return 'LinkedIn';
  if (lower.includes('youtube.com')) return 'YouTube';
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('x.com') || lower.includes('twitter.com')) return 'X';
  return 'Social';
}

async function syncFscInsurers(): Promise<FscSyncResponse> {
  const res = await fetch('/api/v1/admin/insurers/fsc/sync', {
    method: 'POST',
    credentials: 'include',
  });
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
  } & Partial<FscSyncResponse>;
  if (!res.ok) {
    throw new Error(body.message ?? 'Грешка при FSC sync');
  }
  return body as FscSyncResponse;
}

async function fetchFscInsurers(): Promise<FscInsurerRecord[]> {
  const res = await fetch('/api/v1/admin/insurers/fsc?limit=500', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch FSC insurers');
  return res.json() as Promise<FscInsurerRecord[]>;
}

async function fetchFscSyncStatus(): Promise<FscSyncStatusResponse> {
  const res = await fetch('/api/v1/admin/insurers/fsc/sync/status', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch FSC sync status');
  return res.json() as Promise<FscSyncStatusResponse>;
}

export default function AdminInsurersPage() {
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const [disableModal, setDisableModal] = useState<DisableModalState | null>(
    null,
  );
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSyncPolling, setIsSyncPolling] = useState(false);
  const [activeFscTab, setActiveFscTab] =
    useState<FscCategoryKey>('life_insurers');

  const { data, isLoading, error } = useQuery<InsurerApiStatus[]>({
    queryKey: ['admin', 'insurers', 'monitor'],
    queryFn: fetchInsurerMonitor,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const { data: fscInsurers = [], isLoading: isFscLoading } = useQuery<
    FscInsurerRecord[]
  >({
    queryKey: ['admin', 'insurers', 'fsc'],
    queryFn: fetchFscInsurers,
    staleTime: 60_000,
  });
  const { data: syncStatus } = useQuery<FscSyncStatusResponse>({
    queryKey: ['admin', 'insurers', 'fsc', 'sync-status'],
    queryFn: fetchFscSyncStatus,
    enabled: user.role === 'super_admin' && isSyncPolling,
    retry: false,
    refetchInterval: isSyncPolling ? 1500 : false,
    staleTime: 0,
  });

  const disableMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      disableInsurer(id, reason),
    onSuccess: () => {
      setDisableModal(null);
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'insurers', 'monitor'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'insurers', 'fsc'],
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

  const syncMutation = useMutation({
    mutationFn: syncFscInsurers,
    onMutate: () => {
      setIsSyncPolling(true);
      setSyncMessage('FSC sync стартиран...');
    },
    onSuccess: (result) => {
      setSyncMessage(
        `FSC sync успешно. Импортирани записи: ${result.total}.`,
      );
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'insurers', 'monitor'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'insurers', 'fsc'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'insurers', 'fsc', 'sync-status'],
      });
    },
    onError: (err: unknown) => {
      setSyncMessage(
        err instanceof Error ? err.message : 'Грешка при FSC sync',
      );
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'insurers', 'fsc', 'sync-status'],
      });
    },
    onSettled: () => {
      setIsSyncPolling(false);
    },
  });

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
  const filteredFscInsurers = fscInsurers.filter(
    (row) => row.categoryKey === activeFscTab,
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Застрахователи — API мониторинг</h1>
          <p className="mt-1 text-sm text-gray-500">
            Обновява се автоматично на всеки 30 секунди
          </p>
        </div>
        {user.role === 'super_admin' && (
          <button
            onClick={() => {
              setSyncMessage(null);
              syncMutation.mutate();
            }}
            disabled={syncMutation.isPending}
            className="rounded-md border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            {syncMutation.isPending ? 'Sync...' : 'Sync FSC'}
          </button>
        )}
      </div>
      {syncMessage && (
        <p className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {syncMessage}
        </p>
      )}
      {(syncStatus?.logs?.length ?? 0) > 0 && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              FSC Sync Debug
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                syncStatus?.status === 'running'
                  ? 'bg-yellow-100 text-yellow-700'
                  : syncStatus?.status === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
              }`}
            >
              {syncStatus?.status === 'running'
                ? 'В процес'
                : syncStatus?.status === 'error'
                  ? 'Грешка'
                  : 'Готово'}
            </span>
          </div>
          {syncStatus?.errorMessage && (
            <p className="mb-2 text-xs text-red-600">{syncStatus.errorMessage}</p>
          )}
          <div className="max-h-56 overflow-auto rounded border border-gray-100 bg-gray-50 p-2 font-mono text-xs text-gray-700">
            {(syncStatus?.logs ?? []).slice().reverse().map((log, idx) => (
              <div key={`${log.at}-${idx}`} className="mb-1">
                [{new Date(log.at).toLocaleTimeString('bg-BG')}] {log.level.toUpperCase()} {log.message}
              </div>
            ))}
          </div>
        </div>
      )}

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
                    {(ins.errorRate5min ?? 0).toFixed(2)}%
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

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            FSC регистър (записи от базата)
          </h2>
          <span className="text-sm text-gray-500">
            {isFscLoading
              ? 'Зареждане...'
              : `Общо в таба: ${filteredFscInsurers.length}`}
          </span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {FSC_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFscTab(tab.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                tab.key === activeFscTab
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Наименование
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  ЕИК
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Адрес
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Телефон
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Имейли
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Описание
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Social / Trustpilot
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Уебсайт
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredFscInsurers.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{row.eik ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {row.officeAddress ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.officeAddress)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline"
                      >
                        {row.officeAddress}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {splitPhones(row.contactPhone).length > 0 ? (
                      splitPhones(row.contactPhone).map((phone, idx) => (
                        <span key={`${row.id}-${phone}`}>
                          {idx > 0 ? ' | ' : ''}
                          <a href={toTelHref(phone)} className="underline">
                            {phone}
                          </a>
                        </span>
                      ))
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {row.contactEmails && row.contactEmails.length > 0
                      ? row.contactEmails.map((email, idx) => (
                          <span key={`${row.id}-${email}`}>
                            {idx > 0 ? ', ' : ''}
                            <a href={`mailto:${email}`} className="underline">
                              {email}
                            </a>
                          </span>
                        ))
                      : '—'}
                  </td>
                  <td className="max-w-md px-4 py-3 text-sm text-gray-700">
                    {row.longDescription
                      ? `${row.longDescription.slice(0, 240)}${
                          row.longDescription.length > 240 ? '…' : ''
                        }`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {row.socialLinks?.length ? (
                      <div className="mb-1">
                        {row.socialLinks.slice(0, 3).map((link) => (
                          <a
                            key={link}
                            href={link}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="mr-2 underline"
                          >
                            {socialLabel(link)}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {row.trustpilotUrl ? (
                      <a
                        href={row.trustpilotUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline"
                      >
                        Trustpilot
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-blue-700">
                    {row.website ? (
                      <a
                        href={row.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline"
                      >
                        {row.website}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
              {!isFscLoading && filteredFscInsurers.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-sm text-gray-500"
                  >
                    Няма FSC записи в базата.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
