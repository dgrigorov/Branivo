'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const statusFilter =
    activeFilter === 'all' ? undefined : activeFilter;

  const { data, isLoading, error } = useQuery<FleetResponse>({
    queryKey: ['fleet', 'vehicles', activeFilter],
    queryFn: () => fetchFleetVehicles(statusFilter),
  });

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
            onClick={() => setActiveFilter(tab.value)}
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
              {data.data.map((vehicle) => (
                <tr key={vehicle.id} className="hover:bg-gray-50">
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
              {data.data.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
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
