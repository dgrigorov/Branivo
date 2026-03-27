'use client';

import { useEffect } from 'react';
import { useVehicles, type VehicleData } from '@/lib/hooks/use-vehicles';

interface VehiclePickerProps {
  onSelect: (vehicle: VehicleData) => void;
  selectedId?: string;
}

export function VehiclePicker({
  onSelect,
  selectedId,
}: VehiclePickerProps) {
  const { isLoading, vehicles, listVehicles } = useVehicles();

  useEffect(() => {
    void listVehicles();
  }, [listVehicles]);

  if (isLoading) {
    return <p className="text-sm text-gray-500">Зареждане на МПС-та...</p>;
  }

  if (vehicles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
        <p className="mb-3 text-gray-500">Нямате регистрирани МПС-та</p>
        <a
          href="/vehicles/add"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Добави МПС
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {vehicles.map((vehicle) => (
        <button
          key={vehicle.id}
          type="button"
          onClick={() => onSelect(vehicle)}
          className={`rounded-lg border p-4 text-left transition-colors ${
            selectedId === vehicle.id
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 bg-white hover:border-blue-300'
          }`}
        >
          <p className="font-medium">
            {vehicle.make} {vehicle.model} ({vehicle.year})
          </p>
          <p className="text-sm text-gray-600">{vehicle.licensePlate}</p>
        </button>
      ))}
    </div>
  );
}
