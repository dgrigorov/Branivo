'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InviteTenantModal } from '@/components/admin/invite-tenant-modal';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'invited' | 'stripe_connected' | 'active' | 'suspended';
  createdAt: string;
}

interface TenantsResponse {
  data: Tenant[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  invited: {
    label: 'Поканен',
    className: 'bg-yellow-100 text-yellow-800',
  },
  stripe_connected: {
    label: 'Stripe свързан',
    className: 'bg-blue-100 text-blue-800',
  },
  active: {
    label: 'Активен',
    className: 'bg-green-100 text-green-800',
  },
  suspended: {
    label: 'Спрян',
    className: 'bg-red-100 text-red-800',
  },
};

async function fetchTenants(page: number): Promise<TenantsResponse> {
  const res = await fetch(`/api/v1/admin/tenants?page=${page}&limit=20`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch tenants');
  return res.json() as Promise<TenantsResponse>;
}

export default function AdminTenantsPage() {
  const [page, setPage] = useState(1);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'tenants', page],
    queryFn: () => fetchTenants(page),
    staleTime: 30_000,
  });

  const handleInviteSuccess = () => {
    setShowInviteModal(false);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
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
        <p className="text-red-600">Грешка при зареждане на тенанти</p>
      </div>
    );
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Тенанти</h1>
        <button
          onClick={() => setShowInviteModal(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Покани брокер
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Организация
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Slug
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Статус
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Създаден на
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {data?.data.map((tenant) => {
              const badge = STATUS_BADGE[tenant.status] ?? {
                label: tenant.status,
                className: 'bg-gray-100 text-gray-800',
              };
              return (
                <tr key={tenant.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {tenant.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {tenant.slug}.branivo.bg
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(tenant.createdAt).toLocaleDateString('bg-BG')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Общо: {data?.total ?? 0} тенанта
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            >
              Предишна
            </button>
            <span className="px-3 py-1 text-sm">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            >
              Следваща
            </button>
          </div>
        </div>
      )}

      {showInviteModal && (
        <InviteTenantModal
          onSuccess={handleInviteSuccess}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}
