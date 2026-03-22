import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FleetRepository } from './fleet.repository';
import { FleetVehicle } from './entities/fleet-vehicle.entity';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { FleetVehicleFilterDto } from './dto/fleet-vehicle-filter.dto';

const TENANT_ID = 'tenant-uuid-001';

describe('FleetRepository', () => {
  let repository: FleetRepository;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FleetRepository,
        {
          provide: getRepositoryToken(FleetVehicle),
          useValue: {} as Partial<Repository<FleetVehicle>>,
        },
        {
          provide: TenantContext,
          useValue: { getTenantId: jest.fn().mockReturnValue(TENANT_ID) },
        },
        {
          provide: DataSource,
          useValue: { query: jest.fn() },
        },
      ],
    }).compile();

    repository = module.get(FleetRepository);
    dataSource = module.get(DataSource);
  });

  describe('findFleetVehicles', () => {
    it('scopes query to the correct tenant_id', async () => {
      dataSource.query
        .mockResolvedValueOnce([]) // rows
        .mockResolvedValueOnce([{ count: '0' }]); // count

      const filter: FleetVehicleFilterDto = {};
      await repository.findFleetVehicles(TENANT_ID, filter);

      // First call (data query) should use tenant_id as first param
      const firstCall = dataSource.query.mock.calls[0];
      expect(firstCall?.[1]).toEqual([TENANT_ID, 20, 0]);

      // Second call (count query with vehicle join) should also use tenant_id
      const secondCall = dataSource.query.mock.calls[1];
      expect(secondCall?.[1]).toEqual([TENANT_ID]);
    });

    it('uses default pagination when not specified', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '0' }]);

      const filter: FleetVehicleFilterDto = {};
      const result = await repository.findFleetVehicles(TENANT_ID, filter);

      // default limit=20, page=1 → offset=0
      const firstCall = dataSource.query.mock.calls[0];
      expect(firstCall?.[1]).toEqual([TENANT_ID, 20, 0]);
      expect(result.total).toBe(0);
    });

    it('calculates correct offset for page 2, limit 10', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '35' }]);

      const filter: FleetVehicleFilterDto = { page: 2, limit: 10 };
      const result = await repository.findFleetVehicles(TENANT_ID, filter);

      const firstCall = dataSource.query.mock.calls[0];
      expect(firstCall?.[1]).toEqual([TENANT_ID, 10, 10]);
      expect(result.total).toBe(35);
    });

    it('returns items and total from query results', async () => {
      const mockRow = {
        id: 'fv-id-1',
        vehicle_id: 'v-id-1',
        license_plate: 'СА1234АВ',
        make: 'Toyota',
        model: 'Corolla',
        insurer_name: 'ДЗИ',
        policy_expires_at: new Date('2026-06-01'),
      };

      dataSource.query
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([{ count: '1' }]);

      const result = await repository.findFleetVehicles(TENANT_ID, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].license_plate).toBe('СА1234АВ');
      expect(result.total).toBe(1);
    });
  });
});
