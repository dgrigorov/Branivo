'use client';

import { useState, useCallback } from 'react';

export interface VehicleData {
  id: string;
  tenantId: string;
  ownerId: string;
  vin: string;
  licensePlate: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  engineVolume: string | null;
  fuelType: string | null;
  firstRegistrationDate: string | null;
  createdAt: string;
  updatedAt: string;
  lastPolicyStatus?: string | null;
}

export interface CreateVehiclePayload {
  vin: string;
  licensePlate: string;
  make: string;
  model: string;
  year: number;
  color?: string;
  engineVolume?: string;
  fuelType?: string;
  firstRegistrationDate?: string;
}

interface VehiclesState {
  isLoading: boolean;
  error: string | null;
  vehicles: VehicleData[];
}

const initialState: VehiclesState = {
  isLoading: false,
  error: null,
  vehicles: [],
};

export function useVehicles() {
  const [state, setState] = useState<VehiclesState>(initialState);

  const listVehicles = useCallback(async (): Promise<VehicleData[]> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const res = await fetch('/api/v1/vehicles', {
        method: 'GET',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as VehicleData[];
      setState((prev) => ({ ...prev, isLoading: false, vehicles: data }));
      return data;
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Грешка при зареждане на МПС-та.',
      }));
      return [];
    }
  }, []);

  const saveVehicle = useCallback(
    async (payload: CreateVehiclePayload): Promise<VehicleData | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const res = await fetch('/api/v1/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const vehicle = (await res.json()) as VehicleData;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          vehicles: [...prev.vehicles, vehicle],
        }));
        return vehicle;
      } catch {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Грешка при запазване на МПС.',
        }));
        return null;
      }
    },
    [],
  );

  const getVehicle = useCallback(
    async (id: string): Promise<VehicleData | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const res = await fetch(`/api/v1/vehicles/${id}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (res.status === 404) {
          setState((prev) => ({ ...prev, isLoading: false }));
          return null;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const vehicle = (await res.json()) as VehicleData;
        setState((prev) => ({ ...prev, isLoading: false }));
        return vehicle;
      } catch {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Грешка при зареждане на МПС.',
        }));
        return null;
      }
    },
    [],
  );

  return {
    ...state,
    listVehicles,
    saveVehicle,
    getVehicle,
  };
}
