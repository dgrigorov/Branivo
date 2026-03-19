'use client';

import { useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────

type DomainStatus = 'pending' | 'verifying' | 'active' | 'failed';

interface DnsVerificationRecord {
  name: string;
  type: 'TXT';
  value: string;
}

interface DomainResponseDto {
  id: string;
  domain: string;
  isPrimary: boolean;
  status: DomainStatus;
  verificationRecord: DnsVerificationRecord | null;
  verifiedAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

// ─── API helpers ───────────────────────────────────────────────────────────────

async function fetchDomains(): Promise<DomainResponseDto[]> {
  const res = await fetch('/api/v1/tenants/domains');
  if (!res.ok) throw new Error('Failed to fetch domains');
  const json = await res.json() as { data: DomainResponseDto[] };
  return json.data;
}

async function registerDomain(domain: string): Promise<DomainResponseDto> {
  const res = await fetch('/api/v1/tenants/domains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  });
  const json = await res.json() as { data?: DomainResponseDto; message?: string };
  if (!res.ok) throw new Error(json.message ?? 'Failed to register domain');
  return json.data!;
}

async function deleteDomain(id: string): Promise<void> {
  const res = await fetch(`/api/v1/tenants/domains/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    const json = await res.json() as { message?: string };
    throw new Error(json.message ?? 'Failed to delete domain');
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<DomainStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  verifying: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<DomainStatus, string> = {
  pending: 'В изчакване',
  verifying: 'Верифициране...',
  active: 'Активен',
  failed: 'Неуспешно',
};

function StatusBadge({ status }: { status: DomainStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Page component ────────────────────────────────────────────────────────────

const HOSTNAME_REGEX = /^(?!-)(?:[a-zA-Z0-9-]{1,63}(?<!-)\.)+[a-zA-Z]{2,}$/;

export default function DomainSettingsPage() {
  const queryClient = useQueryClient();
  const [domainInput, setDomainInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Poll while any domain is pending/verifying
  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: fetchDomains,
    refetchInterval: (data) => {
      const isPending = data?.state?.data?.some(
        (d) => d.status === 'pending' || d.status === 'verifying',
      );
      return isPending ? 10_000 : false;
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerDomain,
    onSuccess: () => {
      setDomainInput('');
      setMutationError(null);
      void queryClient.invalidateQueries({ queryKey: ['domains'] });
    },
    onError: (err: Error) => setMutationError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDomain,
    onSuccess: () => {
      setDeleteConfirmId(null);
      setMutationError(null);
      void queryClient.invalidateQueries({ queryKey: ['domains'] });
    },
    onError: (err: Error) => setMutationError(err.message),
  });

  const primaryDomain = domains.find((d) => d.isPrimary);
  const customDomain = domains.find((d) => !d.isPrimary);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = domainInput.trim();
    if (!HOSTNAME_REGEX.test(trimmed)) {
      setValidationError(
        'Въведете валиден hostname (напр. polici.mybrokerage.bg)',
      );
      return;
    }
    setValidationError(null);
    setMutationError(null);
    registerMutation.mutate(trimmed);
  }

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setTimeout(() => setCopiedValue(null), 2000);
    } catch {
      // Clipboard API unavailable (non-HTTPS or permissions denied) — no-op
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 text-gray-500">Зареждане на домейни...</div>
    );
  }

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Настройки на домейна
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Конфигурирайте custom домейн за вашия брокерски портал.
        </p>
      </div>

      {/* Primary subdomain */}
      {primaryDomain && (
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Системен поддомейн
              </p>
              <p className="text-base font-mono text-gray-900 mt-0.5">
                {primaryDomain.domain}
              </p>
            </div>
            <StatusBadge status="active" />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Винаги активен — не може да бъде изтрит.
          </p>
        </div>
      )}

      {/* Custom domain */}
      {customDomain ? (
        <div className="rounded-lg border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Custom домейн</p>
              <p className="text-base font-mono text-gray-900 mt-0.5">
                {customDomain.domain}
              </p>
            </div>
            <StatusBadge status={customDomain.status} />
          </div>

          {/* Verification instructions */}
          {customDomain.verificationRecord && (
            <div className="rounded-md bg-blue-50 p-4 space-y-3">
              <p className="text-sm font-medium text-blue-800">
                Добавете следния DNS TXT запис при вашия DNS provider:
              </p>
              <div className="space-y-2 text-sm font-mono">
                <div>
                  <span className="text-blue-600 font-medium">Hostname: </span>
                  <span className="text-gray-800">
                    {customDomain.verificationRecord.name}
                  </span>
                </div>
                <div>
                  <span className="text-blue-600 font-medium">Type: </span>
                  <span className="text-gray-800">TXT</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600 font-medium">Value: </span>
                  <span className="text-gray-800 break-all">
                    {customDomain.verificationRecord.value}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(customDomain.verificationRecord!.value)
                    }
                    className="shrink-0 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200"
                  >
                    {copiedValue === customDomain.verificationRecord.value
                      ? 'Копирано!'
                      : 'Копирай'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-blue-600">
                DNS промените може да отнемат до 48 часа. Проверката се
                извършва автоматично на всеки 5 минути.
              </p>
            </div>
          )}

          {/* Failure reason */}
          {customDomain.status === 'failed' && customDomain.failureReason && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {customDomain.failureReason}
            </div>
          )}

          {/* Delete */}
          {deleteConfirmId === customDomain.id ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Сигурни ли сте?</span>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(customDomain.id)}
                disabled={deleteMutation.isPending}
                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Изтриване...' : 'Да, изтрий'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
              >
                Отказ
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteConfirmId(customDomain.id)}
              className="text-sm text-red-600 hover:text-red-800 underline"
            >
              Изтрий домейна
            </button>
          )}
        </div>
      ) : (
        /* Add custom domain form */
        <div className="rounded-lg border border-gray-200 p-4 space-y-4">
          <div>
            <h2 className="text-base font-medium text-gray-800">
              Добавяне на custom домейн
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Вашите клиенти ще достъпват платформата чрез вашия собствен
              домейн.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="domain"
                className="block text-sm font-medium text-gray-700"
              >
                Домейн
              </label>
              <input
                id="domain"
                type="text"
                value={domainInput}
                onChange={(e) => {
                  setDomainInput(e.target.value);
                  setValidationError(null);
                }}
                placeholder="polici.mybrokerage.bg"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {validationError && (
                <p className="mt-1 text-sm text-red-600">{validationError}</p>
              )}
            </div>

            {mutationError && (
              <p className="text-sm text-red-600">{mutationError}</p>
            )}

            <button
              type="submit"
              disabled={!domainInput.trim() || registerMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {registerMutation.isPending
                ? 'Добавяне...'
                : 'Добави домейн'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
