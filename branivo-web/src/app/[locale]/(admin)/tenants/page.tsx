'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { InviteTenantModal } from '@/components/admin/invite-tenant-modal';
import { ConfirmStatusModal } from '@/components/admin/confirm-status-modal';

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

async function updateTenantStatus(
  id: string,
  status: 'active' | 'suspended',
): Promise<void> {
  const res = await fetch(`/api/v1/admin/tenants/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status }),
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json() as { message?: string };
    throw new Error(body.message ?? 'Грешка при смяна на статус');
  }
}

interface StatusAction {
  tenant: Tenant;
  action: 'deactivate' | 'reactivate';
}

export default function AdminTenantsPage() {
  const [page, setPage] = useState(1);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'tenants', page],
    queryFn: () => fetchTenants(page),
    staleTime: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      updateTenantStatus(id, status),
    onSuccess: () => {
      setStatusAction(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
    },
  });

  const handleInviteSuccess = () => {
    setShowInviteModal(false);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
  };

  const handleStatusConfirm = () => {
    if (!statusAction) return;
    const newStatus =
      statusAction.action === 'deactivate' ? 'suspended' : 'active';
    statusMutation.mutate({ id: statusAction.tenant.id, status: newStatus });
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
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Действия
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
                  <td className="px-6 py-4">
                    {tenant.status === 'active' && (
                      <button
                        onClick={() =>
                          setStatusAction({ tenant, action: 'deactivate' })
                        }
                        className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Деактивирай
                      </button>
                    )}
                    {tenant.status === 'suspended' && (
                      <button
                        onClick={() =>
                          setStatusAction({ tenant, action: 'reactivate' })
                        }
                        className="rounded border border-green-300 px-3 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
                      >
                        Реактивирай
                      </button>
                    )}
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

      {statusAction && (
        <ConfirmStatusModal
          tenantName={statusAction.tenant.name}
          action={statusAction.action}
          onConfirm={handleStatusConfirm}
          onClose={() => {
            if (!statusMutation.isPending) setStatusAction(null);
          }}
          isLoading={statusMutation.isPending}
        />
      )}
    </div>
  );
}
