'use client';

import { useEffect, useState } from 'react';
import { useVehicles, type VehicleData } from '@/lib/hooks/use-vehicles';

function VehicleCard({ vehicle }: { vehicle: VehicleData }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold">
            {vehicle.make} {vehicle.model} ({vehicle.year})
          </p>
          <p className="text-sm text-gray-600">{vehicle.licensePlate}</p>
          <p className="text-xs text-gray-400">VIN: {vehicle.vin}</p>
        </div>
        {vehicle.lastPolicyStatus && (
          <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
            {vehicle.lastPolicyStatus}
          </span>
        )}
      </div>
    </div>
  );
}

function VehicleListContent({ accessToken }: { accessToken: string }) {
  const { isLoading, error, vehicles, listVehicles } = useVehicles(accessToken);

  useEffect(() => {
    void listVehicles();
  }, [listVehicles]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Зареждане...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-gray-500">Нямате регистрирани МПС-та</p>
        <a
          href="/vehicles/add"
          className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          Добави МПС
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Моите МПС-та</h1>
      <div className="flex flex-col gap-4">
        {vehicles.map((vehicle) => (
          <VehicleCard key={vehicle.id} vehicle={vehicle} />
        ))}
      </div>
    </div>
  );
}

export default function VehicleListPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token') ?? '';
    setAccessToken(token);
  }, []);

  if (accessToken === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Зареждане...</p>
      </div>
    );
  }

  return <VehicleListContent accessToken={accessToken} />;
}
