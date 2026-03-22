'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FleetVehicleStatusBadge } from '@/components/fleet/FleetVehicleStatusBadge';

type FleetVehicleStatus = 'green' | 'yellow' | 'red';

interface FleetVehicle {
  id: string;
  vehicleId: string;
  licensePlate: string;
  make: string;
  model: string;
  insurerName: string | null;
  policyExpiresAt: string | null;
  activePolicyId: string | null;
  status: FleetVehicleStatus;
}

interface FleetMeta {
  total: number;
  page: number;
  limit: number;
  timestamp: string;
}

interface FleetResponse {
  data: FleetVehicle[];
  meta: FleetMeta;
}

async function fetchFleetVehicles(
  status?: FleetVehicleStatus,
): Promise<FleetResponse> {
  const params = new URLSearchParams({ limit: '50' });
  if (status) params.set('status', status);
  const res = await fetch(`/api/v1/fleet/vehicles?${params.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Грешка при зареждане на флота');
  return res.json() as Promise<FleetResponse>;
}

type FilterTab = 'all' | FleetVehicleStatus;

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'Всички' },
  { value: 'green', label: '🟢 Зелени' },
  { value: 'yellow', label: '🟡 Жълти' },
  { value: 'red', label: '🔴 Червени' },
];

export default function FleetPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const statusFilter =
    activeFilter === 'all' ? undefined : activeFilter;

  const { data, isLoading, error } = useQuery<FleetResponse>({
    queryKey: ['fleet', 'vehicles', activeFilter],
    queryFn: () => fetchFleetVehicles(statusFilter),
  });

  const vehicles = data?.data ?? [];

  function toggleVehicle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === vehicles.length && vehicles.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(vehicles.map((v) => v.id)));
    }
  }

  function handleGetQuotes() {
    const ids = Array.from(selectedIds).join(',');
    router.push(`/fleet/bulk-quotes?vehicleIds=${ids}`);
  }

  const exportMutation = useMutation({
    mutationFn: async (policyIds: string[]) => {
      const res = await fetch('/api/v1/fleet/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ policyIds }),
      });
      if (!res.ok) throw new Error('Грешка при стартиране на експорта');
      return res.json() as Promise<{ exportId: string }>;
    },
    onSuccess: ({ exportId }) => {
      router.push(`/fleet/exports/${exportId}`);
    },
  });

  function handleExportDocuments() {
    const selectedVehicles = vehicles.filter((v) => selectedIds.has(v.id));
    const policyIds = selectedVehicles
      .map((v) => v.activePolicyId)
      .filter((id): id is string => id !== null);
    if (policyIds.length === 0) return;
    exportMutation.mutate(policyIds);
  }

  const allSelected =
    vehicles.length > 0 && selectedIds.size === vehicles.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Fleet Dashboard</h1>
        {data && (
          <span className="text-sm text-gray-500">
            Общо: {data.meta.total} МПС
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setActiveFilter(tab.value);
              setSelectedIds(new Set());
            }}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeFilter === tab.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm text-blue-800 font-medium">
            {selectedIds.size} МПС избрани
          </span>
          <button
            onClick={handleGetQuotes}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          >
            Получи оферти
          </button>
          <button
            onClick={handleExportDocuments}
            disabled={exportMutation.isPending}
            className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {exportMutation.isPending ? 'Стартиране...' : 'Изтегли документи'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Изчисти избора
          </button>
        </div>
      )}

      {isLoading && (
        <div className="p-6 text-gray-500">Зареждане...</div>
      )}

      {error && (
        <div className="p-6 text-red-500">
          Грешка при зареждане на флота
        </div>
      )}

      {data && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-blue-600 cursor-pointer"
                    aria-label="Избери всички"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Статус
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Рег. номер
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Марка / Модел
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Застраховател
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Изтича на
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vehicles.map((vehicle) => (
                <tr
                  key={vehicle.id}
                  onClick={() => toggleVehicle(vehicle.id)}
                  className={`cursor-pointer transition-colors ${
                    selectedIds.has(vehicle.id)
                      ? 'bg-blue-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(vehicle.id)}
                      onChange={() => toggleVehicle(vehicle.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-gray-300 text-blue-600 cursor-pointer"
                      aria-label={`Избери ${vehicle.licensePlate}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <FleetVehicleStatusBadge status={vehicle.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-900">
                    {vehicle.licensePlate}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {vehicle.make} {vehicle.model}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {vehicle.insurerName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {vehicle.policyExpiresAt
                      ? new Date(vehicle.policyExpiresAt).toLocaleDateString(
                          'bg-BG',
                        )
                      : '—'}
                  </td>
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    Няма МПС
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
