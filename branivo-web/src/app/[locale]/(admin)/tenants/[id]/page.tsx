'use client';

import { useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { webFetch, webPost } from '@/lib/web-fetch';

interface PendingDowngradeInfo {
  newPlan: string;
  enforceAt: string;
}

interface TierChangePreview {
  oldPlan: string;
  newPlan: string;
  isUpgrade: boolean;
  affectedFlags: string[];
  graceEndsAt: string | null;
}

interface TenantHealthDetail {
  tenantId: string;
  tenantName: string;
  activeUsersCount: number;
  totalRevenueBgn: number;
  vehicleCount: number;
  lastPolicyCreatedAt: string | null;
  lastPolicyInsurer: string | null;
  activeFeatureFlags: string[];
  currentPlan: string;
  pendingDowngrade: PendingDowngradeInfo | null;
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

const PLAN_BADGE_COLORS: Record<string, string> = {
  starter: 'bg-gray-100 text-gray-800',
  professional: 'bg-blue-100 text-blue-800',
  enterprise: 'bg-purple-100 text-purple-800',
};

async function fetchTenantDetail(tenantId: string): Promise<TenantHealthDetail> {
  return webFetch<TenantHealthDetail>(`/api/v1/admin/health/${tenantId}`);
}

async function fetchTierPreview(
  tenantId: string,
  newPlan: string,
): Promise<TierChangePreview> {
  return webFetch<TierChangePreview>(
    `/api/v1/admin/tenants/${tenantId}/subscription/preview?newPlan=${newPlan}`,
  );
}

async function applyTierChange(
  tenantId: string,
  newPlan: string,
): Promise<TierChangePreview> {
  return webPost<TierChangePreview>(
    `/api/v1/admin/tenants/${tenantId}/subscription/tier`,
    { newPlan },
  );
}

export default function TenantHealthDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();

  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [preview, setPreview] = useState<TierChangePreview | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'tenants', 'health', id],
    queryFn: () => fetchTenantDetail(id),
    staleTime: 30_000,
  });

  const changeTierMutation = useMutation({
    mutationFn: (newPlan: string) => applyTierChange(id, newPlan),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants', 'health', id] });
      setShowModal(false);
      setSelectedPlan('');
      setPreview(null);
    },
  });

  const handlePlanSelect = (plan: string) => {
    setSelectedPlan(plan);
    setPreview(null);
    setPreviewError(null);
  };

  const handlePreview = async () => {
    if (!selectedPlan || !data) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await fetchTierPreview(id, selectedPlan);
      setPreview(result);
      setShowModal(true);
    } catch {
      setPreviewError('Грешка при зареждане на preview. Опитайте отново.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedPlan) return;
    changeTierMutation.mutate(selectedPlan);
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
        <p className="text-red-600">
          {error instanceof Error ? error.message : 'Грешка при зареждане'}
        </p>
        <button
          onClick={() => router.push('/bg/tenants')}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          ← Назад към тенанти
        </button>
      </div>
    );
  }

  if (!data) return null;

  const availablePlans = ['starter', 'professional', 'enterprise'].filter(
    (p) => p !== data.currentPlan,
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={() => router.push('/bg/tenants')}
          className="mb-4 text-sm text-blue-600 hover:underline"
        >
          ← Назад
        </button>
        <h1 className="text-2xl font-semibold">{data.tenantName}</h1>
        <p className="text-sm text-gray-500">{data.tenantId}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Активни потребители
          </p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {data.activeUsersCount}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Приход (BGN)
          </p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {data.totalRevenueBgn.toFixed(2)}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Брой МПС
          </p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {data.vehicleCount}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Последна полица
        </h2>
        {data.lastPolicyCreatedAt ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Дата:</span>
              <span className="text-sm text-gray-900">
                {new Date(data.lastPolicyCreatedAt).toLocaleDateString('bg-BG')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Застраховател:</span>
              <span className="text-sm text-gray-900">
                {data.lastPolicyInsurer ?? '—'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Няма регистрирани полици</p>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Активни Feature Flags
        </h2>
        {data.activeFeatureFlags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.activeFeatureFlags.map((flag) => (
              <span
                key={flag}
                className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800"
              >
                {flag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Няма активни флагове</p>
        )}
      </div>

      {/* Subscription tier section */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Абонаментен план
        </h2>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Текущ план:</span>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${PLAN_BADGE_COLORS[data.currentPlan] ?? 'bg-gray-100 text-gray-800'}`}
          >
            {PLAN_LABELS[data.currentPlan] ?? data.currentPlan}
          </span>
        </div>

        {data.pendingDowngrade && (
          <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-3">
            <p className="text-sm text-yellow-800">
              ⚠️ Pending downgrade към{' '}
              <strong>{PLAN_LABELS[data.pendingDowngrade.newPlan] ?? data.pendingDowngrade.newPlan}</strong>{' '}
              на{' '}
              <strong>
                {new Date(data.pendingDowngrade.enforceAt).toLocaleDateString('bg-BG')}
              </strong>
            </p>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <SelectField
            value={selectedPlan}
            onChange={(e) => handlePlanSelect(e.target.value)}
            aria-label="Избери нов план"
          >
            <option value="">Избери нов план</option>
            {availablePlans.map((plan) => (
              <option key={plan} value={plan}>
                {PLAN_LABELS[plan] ?? plan}
              </option>
            ))}
          </SelectField>

          <button
            onClick={() => void handlePreview()}
            disabled={!selectedPlan || previewLoading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {previewLoading ? 'Зареждане...' : 'Промени план'}
          </button>
        </div>

        {previewError && (
          <p className="mt-2 text-sm text-red-600">{previewError}</p>
        )}
      </div>

      {/* Preview modal */}
      {showModal && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Потвърди промяна на план
            </h3>

            {preview.isUpgrade ? (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-800">
                  ✅ Upgrade от <strong>{PLAN_LABELS[preview.oldPlan] ?? preview.oldPlan}</strong> към{' '}
                  <strong>{PLAN_LABELS[preview.newPlan] ?? preview.newPlan}</strong>.
                  Новите features ще бъдат активирани незабавно.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                <p className="text-sm text-yellow-800">
                  ⚠️ Downgrade от <strong>{PLAN_LABELS[preview.oldPlan] ?? preview.oldPlan}</strong> към{' '}
                  <strong>{PLAN_LABELS[preview.newPlan] ?? preview.newPlan}</strong>.
                </p>
                {preview.affectedFlags.length > 0 && (
                  <p className="mt-2 text-sm text-yellow-800">
                    Features за деактивиране след 7 дни:{' '}
                    <strong>{preview.affectedFlags.join(', ')}</strong>
                  </p>
                )}
                <p className="mt-1 text-sm text-yellow-700">
                  Брокерът ще получи email известие.
                </p>
              </div>
            )}

            {changeTierMutation.isError && (
              <p className="mt-3 text-sm text-red-600">
                Грешка при промяна. Опитайте отново.
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Отказ
              </button>
              <button
                onClick={handleConfirm}
                disabled={changeTierMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {changeTierMutation.isPending ? 'Запазване...' : 'Потвърди'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
