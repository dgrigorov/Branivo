'use client';

import { useQuery } from '@tanstack/react-query';
import {
  DriverVehicleCard,
  type DriverVehicle,
} from '@/components/fleet/DriverVehicleCard';

async function fetchDriverVehicles(): Promise<DriverVehicle[]> {
  const res = await fetch('/api/v1/fleet/driver/vehicles', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Грешка при зареждане на МПС');
  return res.json() as Promise<DriverVehicle[]>;
}

export default function DriverFleetPage() {
  const { data, isLoading, error } = useQuery<DriverVehicle[]>({
    queryKey: ['fleet', 'driver', 'vehicles'],
    queryFn: fetchDriverVehicles,
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Моите МПС</h1>
        <p className="text-sm text-gray-500 mt-1">
          Показват се само МПС, назначени на вас
        </p>
      </div>

      {isLoading && <div className="text-gray-500">Зареждане...</div>}

      {error && (
        <div className="text-red-500">Грешка при зареждане на МПС</div>
      )}

      {data && (
        <div className="flex flex-col gap-3">
          {data.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              Нямате назначени МПС
            </div>
          ) : (
            data.map((vehicle) => (
              <DriverVehicleCard key={vehicle.vehicleId} vehicle={vehicle} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
