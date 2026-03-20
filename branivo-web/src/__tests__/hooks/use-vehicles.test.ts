import { renderHook, act } from '@testing-library/react';
import { useVehicles, VehicleData, CreateVehiclePayload } from '@/lib/hooks/use-vehicles';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ACCESS_TOKEN = 'test-access-token';
const VEHICLE_ID = 'vehicle-uuid-456';

const mockVehicle: VehicleData = {
  id: VEHICLE_ID,
  tenantId: 'tenant-uuid',
  ownerId: 'owner-uuid',
  vin: 'WVWZZZ3BZ3E123456',
  licensePlate: 'СА1234АА',
  make: 'VW',
  model: 'Golf',
  year: 2020,
  color: null,
  engineVolume: null,
  fuelType: null,
  firstRegistrationDate: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastPolicyStatus: null,
};

describe('useVehicles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listVehicles — success → updates vehicles state', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [mockVehicle],
    });

    const { result } = renderHook(() => useVehicles(ACCESS_TOKEN));

    let vehicles: VehicleData[] = [];
    await act(async () => {
      vehicles = await result.current.listVehicles();
    });

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].id).toBe(VEHICLE_ID);
    expect(result.current.vehicles).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('listVehicles — empty → returns []', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });

    const { result } = renderHook(() => useVehicles(ACCESS_TOKEN));

    let vehicles: VehicleData[] = [];
    await act(async () => {
      vehicles = await result.current.listVehicles();
    });

    expect(vehicles).toEqual([]);
    expect(result.current.vehicles).toEqual([]);
  });

  it('saveVehicle — success → vehicle appended to list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => mockVehicle,
    });

    const { result } = renderHook(() => useVehicles(ACCESS_TOKEN));

    const payload: CreateVehiclePayload = {
      vin: 'WVWZZZ3BZ3E123456',
      licensePlate: 'СА1234АА',
      make: 'VW',
      model: 'Golf',
      year: 2020,
    };

    let saved: VehicleData | null = null;
    await act(async () => {
      saved = await result.current.saveVehicle(payload);
    });

    expect(saved).not.toBeNull();
    expect((saved as unknown as VehicleData).id).toBe(VEHICLE_ID);
    expect(result.current.vehicles).toHaveLength(1);
  });

  it('getVehicle — success → returns vehicle', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockVehicle,
    });

    const { result } = renderHook(() => useVehicles(ACCESS_TOKEN));

    let vehicle: VehicleData | null = null;
    await act(async () => {
      vehicle = await result.current.getVehicle(VEHICLE_ID);
    });

    expect(vehicle).not.toBeNull();
    expect((vehicle as unknown as VehicleData).id).toBe(VEHICLE_ID);
  });

  it('getVehicle — 404 → returns null without error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not found' }),
    });

    const { result } = renderHook(() => useVehicles(ACCESS_TOKEN));

    let vehicle: VehicleData | null = null;
    await act(async () => {
      vehicle = await result.current.getVehicle('non-existent-id');
    });

    expect(vehicle).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('listVehicles — network error → sets error state', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useVehicles(ACCESS_TOKEN));

    await act(async () => {
      await result.current.listVehicles();
    });

    expect(result.current.error).toBe('Грешка при зареждане на МПС-та.');
  });
});
