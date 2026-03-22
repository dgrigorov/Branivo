/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { FleetService } from './fleet.service';
import { FleetRepository } from './fleet.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { FleetVehicleFilterDto } from './dto/fleet-vehicle-filter.dto';
import type { FleetVehicleWithPolicy } from './fleet.repository';

const TENANT_ID = 'tenant-uuid-001';

function makeRow(
  overrides: Partial<FleetVehicleWithPolicy> = {},
): FleetVehicleWithPolicy {
  return {
    id: 'fv-id-1',
    vehicle_id: 'v-id-1',
    license_plate: 'СА1234АВ',
    make: 'Toyota',
    model: 'Corolla',
    insurer_name: 'ДЗИ',
    policy_expires_at: null,
    ...overrides,
  };
}

describe('FleetService', () => {
  let service: FleetService;
  let fleetRepo: jest.Mocked<FleetRepository>;
  let tenantContext: jest.Mocked<TenantContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FleetService,
        {
          provide: FleetRepository,
          useValue: { findFleetVehicles: jest.fn() },
        },
        {
          provide: TenantContext,
          useValue: { getTenantId: jest.fn().mockReturnValue(TENANT_ID) },
        },
      ],
    }).compile();

    service = module.get(FleetService);
    fleetRepo = module.get(FleetRepository);
    tenantContext = module.get(TenantContext);
  });

  describe('calculateStatus', () => {
    it('returns red when policyExpiresAt is null', () => {
      expect(service.calculateStatus(null)).toBe('red');
    });

    it('returns red when policy expired (0 days left)', () => {
      const today = new Date();
      expect(service.calculateStatus(today)).toBe('red');
    });

    it('returns red when policy expired yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(service.calculateStatus(yesterday)).toBe('red');
    });

    it('returns yellow when 15 days until expiry', () => {
      const future = new Date();
      future.setDate(future.getDate() + 15);
      expect(service.calculateStatus(future)).toBe('yellow');
    });

    it('returns yellow when 1 day until expiry', () => {
      const future = new Date();
      future.setDate(future.getDate() + 1);
      expect(service.calculateStatus(future)).toBe('yellow');
    });

    it('returns green when 31 days until expiry', () => {
      // Use 31 days + 1 hour to avoid boundary timing issues
      const future = new Date(
        Date.now() + 31 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
      );
      expect(service.calculateStatus(future)).toBe('green');
    });

    it('returns green when 60 days until expiry', () => {
      const future = new Date();
      future.setDate(future.getDate() + 60);
      expect(service.calculateStatus(future)).toBe('green');
    });
  });

  describe('getFleetVehicles', () => {
    it('calls TenantContext.getTenantId()', async () => {
      fleetRepo.findFleetVehicles.mockResolvedValue({ items: [], total: 0 });
      const filter: FleetVehicleFilterDto = {};

      await service.getFleetVehicles(filter);

      expect(tenantContext.getTenantId).toHaveBeenCalled();
      expect(fleetRepo.findFleetVehicles).toHaveBeenCalledWith(
        TENANT_ID,
        filter,
      );
    });

    it('maps rows to FleetVehicleResponseDto with correct status', async () => {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 40); // green

      fleetRepo.findFleetVehicles.mockResolvedValue({
        items: [makeRow({ policy_expires_at: expiry })],
        total: 1,
      });

      const result = await service.getFleetVehicles({});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('green');
      expect(result.data[0].licensePlate).toBe('СА1234АВ');
      expect(result.meta.total).toBe(1);
    });

    it('filters by status in service layer', async () => {
      const yellowExpiry = new Date();
      yellowExpiry.setDate(yellowExpiry.getDate() + 15);

      const greenExpiry = new Date();
      greenExpiry.setDate(greenExpiry.getDate() + 60);

      fleetRepo.findFleetVehicles.mockResolvedValue({
        items: [
          makeRow({ id: 'fv-1', policy_expires_at: yellowExpiry }),
          makeRow({ id: 'fv-2', policy_expires_at: greenExpiry }),
        ],
        total: 2,
      });

      const filter: FleetVehicleFilterDto = { status: 'yellow' };
      const result = await service.getFleetVehicles(filter);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('yellow');
      // When status filter is active, meta.total reflects filtered count (data.length)
      expect(result.meta.total).toBe(1);
    });

    it('returns empty data when no vehicles match filter', async () => {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 60); // green

      fleetRepo.findFleetVehicles.mockResolvedValue({
        items: [makeRow({ policy_expires_at: expiry })],
        total: 1,
      });

      const result = await service.getFleetVehicles({ status: 'red' });

      expect(result.data).toHaveLength(0);
      // When status filter is active, meta.total reflects filtered count (data.length)
      expect(result.meta.total).toBe(0);
    });

    it('returns correct pagination meta', async () => {
      fleetRepo.findFleetVehicles.mockResolvedValue({ items: [], total: 42 });

      const filter: FleetVehicleFilterDto = { page: 2, limit: 10 };
      const result = await service.getFleetVehicles(filter);

      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.total).toBe(42);
    });
  });
});
