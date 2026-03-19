import { renderHook, act } from '@testing-library/react';
import { useVehicleValidation, VehicleValidationResult } from '@/lib/hooks/use-vehicle-validation';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const SESSION_TOKEN = 'test-session-token';
const VALID_VIN = 'WVWZZZ3BZ3E123456';

const successResult: VehicleValidationResult = {
  canProceedToQuote: true,
  katStatus: 'ok',
  gfStatus: 'clean',
  vinValid: true,
  validatedAt: new Date().toISOString(),
};

describe('useVehicleValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('success flow — returns validation result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => successResult,
    });

    const { result } = renderHook(() => useVehicleValidation(SESSION_TOKEN));

    let validated: VehicleValidationResult | null = null;
    await act(async () => {
      validated = await result.current.validateVehicle({
        vin: VALID_VIN,
        licensePlate: 'СА1234АА',
      });
    });

    expect(validated).not.toBeNull();
    expect(result.current.canProceed).toBe(true);
    expect(result.current.katStatus).toBe('ok');
    expect(result.current.gfStatus).toBe('clean');
    expect(result.current.isBlocked).toBe(false);
  });

  it('GF blocked — sets isBlocked and blockReason', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ code: 'GF_BLOCKED', message: 'МПС нерегламентирано' }),
    });

    const { result } = renderHook(() => useVehicleValidation(SESSION_TOKEN));

    await act(async () => {
      await result.current.validateVehicle({ vin: VALID_VIN, licensePlate: 'СА1234АА' });
    });

    expect(result.current.isBlocked).toBe(true);
    expect(result.current.blockReason).toBe('GF_BLOCKED');
    expect(result.current.canProceed).toBe(false);
  });

  it('KAT manual fallback — katStatus is manual_fallback', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ...successResult,
        katStatus: 'manual_fallback',
      }),
    });

    const { result } = renderHook(() => useVehicleValidation(SESSION_TOKEN));

    await act(async () => {
      await result.current.validateVehicle({ vin: VALID_VIN, licensePlate: 'СА1234АА' });
    });

    expect(result.current.katStatus).toBe('manual_fallback');
    expect(result.current.canProceed).toBe(true);
  });

  it('VIN invalid format — sets vinError', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ statusCode: 422, message: 'VIN невалиден формат' }),
    });

    const { result } = renderHook(() => useVehicleValidation(SESSION_TOKEN));

    await act(async () => {
      await result.current.validateVehicle({ vin: 'BADVIN', licensePlate: 'СА1234АА' });
    });

    expect(result.current.vinError).toBe('VIN невалиден формат');
    expect(result.current.canProceed).toBe(false);
  });
});
