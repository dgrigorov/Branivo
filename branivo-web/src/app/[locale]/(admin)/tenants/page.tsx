'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { InviteTenantModal } from '@/components/admin/invite-tenant-modal';
import { ConfirmStatusModal } from '@/components/admin/confirm-status-modal';
import { useTenantView } from '@/lib/context/tenant-view-context';

interface TenantHealthSummary {
  tenantId: string;
  tenantName: string;
  slug: string;
  status: 'invited' | 'stripe_connected' | 'active' | 'suspended';
  subscriptionTier: string | null;
  policiesLast30Days: number;
  lastActivityAt: string | null;
  inactiveDays: number | null;
}

interface TenantRef {
  id: string;
  name: string;
  status: 'invited' | 'stripe_connected' | 'active' | 'suspended';
}

interface DemoCredential {
  email: string;
  password: string;
  role: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  invited:          { label: 'Поканен',        className: 'bg-yellow-100 text-yellow-800' },
  stripe_connected: { label: 'Stripe свързан', className: 'bg-blue-100 text-blue-800'   },
  active:           { label: 'Активен',         className: 'bg-green-100 text-green-800' },
  suspended:        { label: 'Спрян',           className: 'bg-red-100 text-red-800'    },
};

const DEMO_CREDENTIALS: Record<string, DemoCredential[]> = {
  demo: [
    { email: 'admin@branivo.bg', password: 'Admin1234!', role: 'Брокер Админ' },
    { email: 'agent@branivo.bg', password: 'Agent1234!', role: 'Брокер Агент' },
  ],
  premium: [
    { email: 'admin@premium.bg', password: 'Admin1234!', role: 'Брокер Админ' },
    { email: 'agent@premium.bg', password: 'Agent1234!', role: 'Брокер Агент' },
  ],
};

async function fetchTenantsHealth(): Promise<TenantHealthSummary[]> {
  const res = await fetch('/api/v1/admin/health', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch tenant health');
  return res.json() as Promise<TenantHealthSummary[]>;
}

async function updateTenantStatus(id: string, status: 'active' | 'suspended'): Promise<void> {
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
  tenant: TenantRef;
  action: 'deactivate' | 'reactivate';
}

export default function AdminTenantsPage() {
  const router = useRouter();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const queryClient = useQueryClient();
  const { tenantView, setTenantView } = useTenantView();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'tenants', 'health'],
    queryFn: () => fetchTenantsHealth(),
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
    const newStatus = statusAction.action === 'deactivate' ? 'suspended' : 'active';
    statusMutation.mutate({ id: statusAction.tenant.id, status: newStatus });
  };

  const handleViewTenant = (tenant: TenantHealthSummary) => {
    setTenantView({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      tenantSlug: tenant.slug,
    });
    router.push(`/bg/tenants/${tenant.tenantId}`);
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

  const tenants = data ?? [];
  const activeTenantsWithCreds = tenants.filter(
    (t) => t.status === 'active' && DEMO_CREDENTIALS[t.slug] !== undefined,
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Тенанти</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCredentials((v) => !v)}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {showCredentials ? 'Скрий акаунти' : 'Demo акаунти'}
          </button>
          <button
            onClick={() => setShowInviteModal(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Покани брокер
          </button>
        </div>
      </div>

      {/* Quick access credential cards */}
      {showCredentials && activeTenantsWithCreds.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeTenantsWithCreds.map((tenant) => {
            const creds = DEMO_CREDENTIALS[tenant.slug] ?? [];
            const isViewing = tenantView?.tenantId === tenant.tenantId;
            return (
              <div
                key={tenant.tenantId}
                className={`rounded-xl border p-4 shadow-sm ${
                  isViewing
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{tenant.tenantName}</p>
                    <p className="text-xs text-gray-500">{tenant.slug}.branivo.bg</p>
                  </div>
                  {isViewing && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Активен преглед
                    </span>
                  )}
                </div>
                <div className="mb-3 space-y-2">
                  {creds.map((cred) => (
                    <div key={cred.email} className="rounded-lg bg-gray-50 p-2.5">
                      <p className="text-xs font-medium text-gray-500">{cred.role}</p>
                      <p className="mt-0.5 font-mono text-xs text-gray-800">{cred.email}</p>
                      <p className="font-mono text-xs text-gray-600">{cred.password}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleViewTenant(tenant)}
                  className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isViewing
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-800 text-white hover:bg-slate-900'
                  }`}
                >
                  {isViewing ? 'Преглеждаш сега' : 'Влез в панела'}
                </button>
              </div>
            );
          })}
        </div>
      )}

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
                Тиер
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Полици (30 дни)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Последна активност
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {tenants.map((tenant) => {
              const badge = STATUS_BADGE[tenant.status] ?? {
                label: tenant.status,
                className: 'bg-gray-100 text-gray-800',
              };
              const isInactive = (tenant.inactiveDays ?? 0) > 7;
              const isViewing = tenantView?.tenantId === tenant.tenantId;

              return (
                <tr
                  key={tenant.tenantId}
                  onClick={() => router.push(`/bg/tenants/${tenant.tenantId}`)}
                  className={`cursor-pointer hover:bg-gray-50 ${
                    isViewing ? 'bg-blue-50' : isInactive ? 'bg-yellow-50' : ''
                  }`}
                >
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {tenant.tenantName}
                      {isViewing && (
                        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                          Преглед
                        </span>
                      )}
                    </div>
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
                    {tenant.subscriptionTier ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {tenant.policiesLast30Days}
                  </td>
                  <td
                    className={`px-6 py-4 text-sm ${
                      isInactive ? 'font-medium text-amber-600' : 'text-gray-500'
                    }`}
                  >
                    {tenant.inactiveDays !== null && tenant.inactiveDays > 0
                      ? tenant.inactiveDays === 1
                        ? '1 ден'
                        : `${tenant.inactiveDays} дни`
                      : '—'}
                  </td>
                  <td
                    className="px-6 py-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      {tenant.status === 'active' && (
                        <button
                          onClick={() => handleViewTenant(tenant)}
                          className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
                            isViewing
                              ? 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'
                              : 'border-blue-300 text-blue-600 hover:bg-blue-50'
                          }`}
                        >
                          {isViewing ? 'Активен' : 'Преглед'}
                        </button>
                      )}
                      {tenant.status === 'active' && (
                        <button
                          onClick={() =>
                            setStatusAction({
                              tenant: { id: tenant.tenantId, name: tenant.tenantName, status: tenant.status },
                              action: 'deactivate',
                            })
                          }
                          className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Деактивирай
                        </button>
                      )}
                      {tenant.status === 'suspended' && (
                        <button
                          onClick={() =>
                            setStatusAction({
                              tenant: { id: tenant.tenantId, name: tenant.tenantName, status: tenant.status },
                              action: 'reactivate',
                            })
                          }
                          className="rounded border border-green-300 px-3 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
                        >
                          Реактивирай
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
