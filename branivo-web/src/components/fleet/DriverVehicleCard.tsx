'use client';

import { FleetVehicleStatusBadge } from './FleetVehicleStatusBadge';

type FleetVehicleStatus = 'green' | 'yellow' | 'red';

export interface DriverVehicle {
  vehicleId: string;
  licensePlate: string;
  make: string;
  model: string;
  insurerName: string | null;
  policyExpiresAt: string | null;
  policyStatus: string | null;
}

function computeStatus(
  policyExpiresAt: string | null,
  policyStatus: string | null,
): FleetVehicleStatus {
  if (!policyExpiresAt || policyStatus !== 'active') return 'red';
  const daysLeft = Math.floor(
    (new Date(policyExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (daysLeft > 30) return 'green';
  if (daysLeft >= 1) return 'yellow';
  return 'red';
}

interface Props {
  vehicle: DriverVehicle;
}

export function DriverVehicleCard({ vehicle }: Props) {
  const status = computeStatus(vehicle.policyExpiresAt, vehicle.policyStatus);

  return (
    <div className="flex items-start gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
      <div className="pt-0.5">
        <FleetVehicleStatusBadge status={status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-base font-bold text-gray-900">
          {vehicle.licensePlate}
        </p>
        <p className="text-sm text-gray-700 mt-0.5">
          {vehicle.make} {vehicle.model}
        </p>
        <p className="text-sm text-gray-500 mt-0.5">
          {vehicle.insurerName ?? '—'}
        </p>
        {vehicle.policyExpiresAt ? (
          <p className="text-xs text-gray-400 mt-1">
            Изтича:{' '}
            {new Date(vehicle.policyExpiresAt).toLocaleDateString('bg-BG')}
          </p>
        ) : (
          <p className="text-xs text-red-500 mt-1">Няма активна полица</p>
        )}
      </div>
    </div>
  );
}
