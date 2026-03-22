'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';

interface TenantHealthDetail {
  tenantId: string;
  tenantName: string;
  activeUsersCount: number;
  totalRevenueBgn: number;
  vehicleCount: number;
  lastPolicyCreatedAt: string | null;
  lastPolicyInsurer: string | null;
  activeFeatureFlags: string[];
}

async function fetchTenantDetail(tenantId: string): Promise<TenantHealthDetail> {
  const res = await fetch(`/api/v1/admin/health/${tenantId}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Тенантът не е намерен');
    throw new Error('Грешка при зареждане на детайли');
  }
  return res.json() as Promise<TenantHealthDetail>;
}

export default function TenantHealthDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'tenants', 'health', id],
    queryFn: () => fetchTenantDetail(id),
    staleTime: 30_000,
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
        <p className="text-red-600">
          {error instanceof Error ? error.message : 'Грешка при зареждане'}
        </p>
        <button
          onClick={() => router.push('/admin/tenants')}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          ← Назад към тенанти
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={() => router.push('/admin/tenants')}
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
    </div>
  );
}
