'use client';

import { useState, useCallback } from 'react';

export interface ValidateVehiclePayload {
  vin: string;
  licensePlate: string;
  katManuallyConfirmed?: boolean;
}

export type KatStatus = 'ok' | 'manual_fallback' | 'failed' | 'unavailable';
export type GfStatus = 'clean' | 'flagged' | 'unavailable';

export interface VehicleValidationResult {
  canProceedToQuote: boolean;
  katStatus: KatStatus;
  gfStatus: GfStatus;
  vinValid: boolean;
  validatedAt: string;
}

interface ValidationState {
  isLoading: boolean;
  isBlocked: boolean;
  blockReason: string | null;
  katStatus: KatStatus | null;
  gfStatus: GfStatus | null;
  canProceed: boolean;
  vinError: string | null;
  result: VehicleValidationResult | null;
}

const initialState: ValidationState = {
  isLoading: false,
  isBlocked: false,
  blockReason: null,
  katStatus: null,
  gfStatus: null,
  canProceed: false,
  vinError: null,
  result: null,
};

export function useVehicleValidation(sessionToken: string) {
  const [state, setState] = useState<ValidationState>(initialState);

  const validateVehicle = useCallback(
    async (data: ValidateVehiclePayload): Promise<VehicleValidationResult | null> => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        isBlocked: false,
        blockReason: null,
        vinError: null,
      }));

      try {
        const res = await fetch('/api/v1/vehicles/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': sessionToken,
          },
          body: JSON.stringify(data),
        });

        if (res.status === 403) {
          const body = await res.json() as { code?: string; message?: string };
          const code = body.code ?? 'GF_BLOCKED';
          setState((prev) => ({
            ...prev,
            isLoading: false,
            isBlocked: true,
            blockReason: code,
            canProceed: false,
          }));
          return null;
        }

        if (res.status === 422) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            vinError: 'VIN невалиден формат',
          }));
          return null;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const result = await res.json() as VehicleValidationResult;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          katStatus: result.katStatus,
          gfStatus: result.gfStatus,
          canProceed: result.canProceedToQuote,
          result,
        }));

        return result;
      } catch {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          vinError: 'Грешка при валидация. Моля, опитайте отново.',
        }));
        return null;
      }
    },
    [sessionToken],
  );

  const reset = useCallback(() => setState(initialState), []);

  return {
    ...state,
    validateVehicle,
    reset,
  };
}
