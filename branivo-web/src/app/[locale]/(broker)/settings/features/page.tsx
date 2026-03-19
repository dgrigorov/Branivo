'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatureFlagDefinition {
  key: string;
  enabled: boolean;
  planRestricted: boolean;
  requiredPlan: string | null;
}

interface FeatureFlagsResponse {
  data: {
    flags: FeatureFlagDefinition[];
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAG_LABELS: Record<string, { label: string; description: string }> = {
  fleet: {
    label: 'Fleet Management',
    description: 'Управление на автопарк — групови заявки и bulk полици',
  },
  kasko: {
    label: 'Каско Застраховка',
    description: 'Предлагане на каско продукти на клиентите',
  },
  api_access: {
    label: 'API Достъп',
    description: 'Програмен достъп до платформата чрез REST API',
  },
  sticker_delivery: {
    label: 'Стикер Доставка',
    description: 'Автоматична доставка на стикери чрез Speedy/Econt',
  },
  dkp: {
    label: 'Цифров Констативен Протокол',
    description: 'Offline съставяне на КП директно от мобилното приложение',
  },
  renewal_sms: {
    label: 'SMS Известия за Подновяване',
    description: 'Изпращане на SMS напомняния за изтичащи полици',
  },
  renewal_push: {
    label: 'Push Известия за Подновяване',
    description: 'Push нотификации в мобилното приложение за подновяване',
  },
};

const PLAN_LABELS: Record<string, string> = {
  professional: 'Professional',
  enterprise: 'Enterprise',
};

// ─── API helpers ───────────────────────────────────────────────────────────────

async function fetchFeatureFlags(): Promise<FeatureFlagDefinition[]> {
  const res = await fetch('/api/v1/tenants/features');
  if (!res.ok) throw new Error('Failed to fetch feature flags');
  const json = (await res.json()) as FeatureFlagsResponse;
  return json.data.flags;
}

async function updateFeatureFlag(payload: {
  flag: string;
  value: boolean;
}): Promise<void> {
  const res = await fetch('/api/v1/tenants/features', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [payload.flag]: payload.value }),
  });
  if (res.status === 204) return;
  const body = (await res.json()) as { message?: string };
  if (!res.ok) throw new Error(body.message ?? 'Failed to update feature flag');
}

// ─── Toggle component ─────────────────────────────────────────────────────────

interface FeatureFlagRowProps {
  flag: FeatureFlagDefinition;
  onToggle: (key: string, newValue: boolean) => void;
  isPending: boolean;
  error: string | null;
}

function FeatureFlagRow({ flag, onToggle, isPending, error }: FeatureFlagRowProps) {
  const meta = FLAG_LABELS[flag.key];
  const label = meta?.label ?? flag.key;
  const description = meta?.description ?? '';
  const isDisabled = flag.planRestricted || isPending;

  return (
    <div className="flex items-start justify-between py-4 border-b border-gray-100 last:border-0">
      <div className="flex-1 pr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{label}</span>
          {flag.planRestricted && flag.requiredPlan && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Изисква {PLAN_LABELS[flag.requiredPlan] ?? flag.requiredPlan} план
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        {error && (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={flag.enabled}
        aria-label={label}
        disabled={isDisabled}
        onClick={() => onToggle(flag.key, !flag.enabled)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          isDisabled ? 'cursor-not-allowed opacity-50' : '',
          flag.enabled && !flag.planRestricted ? 'bg-blue-600' : 'bg-gray-200',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span
          className={[
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0',
            'transition duration-200 ease-in-out',
            flag.enabled && !flag.planRestricted ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

// ─── Page component ────────────────────────────────────────────────────────────

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient();
  const [flagErrors, setFlagErrors] = useState<Record<string, string>>({});
  const [optimisticFlags, setOptimisticFlags] = useState<
    Record<string, boolean>
  >({});
  const [pendingFlags, setPendingFlags] = useState<Set<string>>(new Set());

  const { data: flags = [], isLoading } = useQuery({
    queryKey: ['tenants', 'features'],
    queryFn: fetchFeatureFlags,
  });

  const mutation = useMutation({
    mutationFn: updateFeatureFlag,
    onSuccess: (_data, variables) => {
      setFlagErrors((prev) => {
        const next = { ...prev };
        delete next[variables.flag];
        return next;
      });
      setOptimisticFlags((prev) => {
        const next = { ...prev };
        delete next[variables.flag];
        return next;
      });
      setPendingFlags((prev) => {
        const next = new Set(prev);
        next.delete(variables.flag);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['tenants', 'features'] });
    },
    onError: (err: Error, variables) => {
      // Rollback optimistic update
      setOptimisticFlags((prev) => {
        const next = { ...prev };
        delete next[variables.flag];
        return next;
      });
      setPendingFlags((prev) => {
        const next = new Set(prev);
        next.delete(variables.flag);
        return next;
      });
      setFlagErrors((prev) => ({ ...prev, [variables.flag]: err.message }));
    },
  });

  function handleToggle(key: string, newValue: boolean) {
    // Optimistic update
    setOptimisticFlags((prev) => ({ ...prev, [key]: newValue }));
    setPendingFlags((prev) => new Set(prev).add(key));
    setFlagErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    mutation.mutate({ flag: key, value: newValue });
  }

  // Merge server state with optimistic updates
  const displayFlags = flags.map((flag) => ({
    ...flag,
    enabled:
      flag.key in optimisticFlags ? optimisticFlags[flag.key] : flag.enabled,
  }));

  if (isLoading) {
    return <div className="p-6 text-gray-500">Зареждане на функции...</div>;
  }

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Управление на функции
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Включете или изключете функционалности за вашия tenant. Промените влизат в сила незабавно.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        <div className="px-4">
          {displayFlags.map((flag) => (
            <FeatureFlagRow
              key={flag.key}
              flag={flag}
              onToggle={handleToggle}
              isPending={pendingFlags.has(flag.key)}
              error={flagErrors[flag.key] ?? null}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Функции с план ограничения изискват надграждане на абонамента. Свържете се с поддръжката за повече информация.
      </p>
    </div>
  );
}
