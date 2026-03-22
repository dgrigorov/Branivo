/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FleetDriverService } from './fleet-driver.service';
import { FleetDriverRepository } from './fleet-driver.repository';
import { UsersRepository } from '../users/users.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import type { DriverVehicleRow } from './fleet-driver.repository';
import type { User } from '../users/entities/user.entity';

const TENANT_ID = 'tenant-uuid-001';
const USER_ID = 'user-uuid-driver-01';
const VEHICLE_ID = 'vehicle-uuid-001';

function makeRow(overrides: Partial<DriverVehicleRow> = {}): DriverVehicleRow {
  return {
    vehicle_id: VEHICLE_ID,
    license_plate: 'КА0001ФЛ',
    make: 'BMW',
    model: 'X5',
    insurer_name: 'Allianz Bulgaria',
    policy_expires_at: new Date('2026-06-01'),
    policy_status: 'active',
    ...overrides,
  };
}

function makeDriverUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    tenantId: TENANT_ID,
    email: 'driver@branivo.bg',
    passwordHash: 'hash',
    role: 'driver',
    twoFaEnabled: false,
    twoFaSecretEnc: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('FleetDriverService', () => {
  let service: FleetDriverService;
  let fleetDriverRepo: jest.Mocked<FleetDriverRepository>;
  let usersRepo: jest.Mocked<UsersRepository>;
  let tenantContext: jest.Mocked<TenantContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FleetDriverService,
        {
          provide: FleetDriverRepository,
          useValue: {
            findDriverVehiclesWithPolicies: jest.fn(),
            assignDriver: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            findByIdAndTenant: jest.fn(),
          },
        },
        {
          provide: TenantContext,
          useValue: { getTenantId: jest.fn().mockReturnValue(TENANT_ID) },
        },
      ],
    }).compile();

    service = module.get(FleetDriverService);
    fleetDriverRepo = module.get(FleetDriverRepository);
    usersRepo = module.get(UsersRepository);
    tenantContext = module.get(TenantContext);
  });

  describe('getDriverView', () => {
    it('calls getTenantId and findDriverVehiclesWithPolicies with correct args', async () => {
      fleetDriverRepo.findDriverVehiclesWithPolicies.mockResolvedValue([]);

      await service.getDriverView(USER_ID);

      expect(tenantContext.getTenantId).toHaveBeenCalled();
      expect(
        fleetDriverRepo.findDriverVehiclesWithPolicies,
      ).toHaveBeenCalledWith(USER_ID, TENANT_ID);
    });

    it('maps rows to DriverVehicleResponseDto correctly', async () => {
      const expires = new Date('2026-06-01');
      fleetDriverRepo.findDriverVehiclesWithPolicies.mockResolvedValue([
        makeRow({ policy_expires_at: expires }),
      ]);

      const result = await service.getDriverView(USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].licensePlate).toBe('КА0001ФЛ');
      expect(result[0].make).toBe('BMW');
      expect(result[0].model).toBe('X5');
      expect(result[0].insurerName).toBe('Allianz Bulgaria');
      expect(result[0].policyStatus).toBe('active');
      expect(result[0].policyExpiresAt).toEqual(expires);
    });

    it('maps null policy fields correctly', async () => {
      fleetDriverRepo.findDriverVehiclesWithPolicies.mockResolvedValue([
        makeRow({
          insurer_name: null,
          policy_expires_at: null,
          policy_status: null,
        }),
      ]);

      const result = await service.getDriverView(USER_ID);

      expect(result[0].insurerName).toBeNull();
      expect(result[0].policyExpiresAt).toBeNull();
      expect(result[0].policyStatus).toBeNull();
    });

    it('returns empty array when driver has no vehicles', async () => {
      fleetDriverRepo.findDriverVehiclesWithPolicies.mockResolvedValue([]);

      const result = await service.getDriverView(USER_ID);

      expect(result).toHaveLength(0);
    });
  });

  describe('assignDriver', () => {
    it('assigns driver after validating role', async () => {
      usersRepo.findByIdAndTenant.mockResolvedValue(makeDriverUser());
      fleetDriverRepo.assignDriver.mockResolvedValue(undefined);

      await service.assignDriver(VEHICLE_ID, USER_ID);

      expect(usersRepo.findByIdAndTenant).toHaveBeenCalledWith(
        USER_ID,
        TENANT_ID,
      );
      expect(fleetDriverRepo.assignDriver).toHaveBeenCalledWith(
        VEHICLE_ID,
        TENANT_ID,
        USER_ID,
      );
    });

    it('throws BadRequestException when user is not a driver', async () => {
      usersRepo.findByIdAndTenant.mockResolvedValue(
        makeDriverUser({ role: 'broker_agent' }),
      );

      await expect(service.assignDriver(VEHICLE_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(fleetDriverRepo.assignDriver).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when user not found', async () => {
      usersRepo.findByIdAndTenant.mockResolvedValue(null);

      await expect(service.assignDriver(VEHICLE_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('unassigns driver when driverUserId is null', async () => {
      fleetDriverRepo.assignDriver.mockResolvedValue(undefined);

      await service.assignDriver(VEHICLE_ID, null);

      expect(usersRepo.findByIdAndTenant).not.toHaveBeenCalled();
      expect(fleetDriverRepo.assignDriver).toHaveBeenCalledWith(
        VEHICLE_ID,
        TENANT_ID,
        null,
      );
    });

    it('propagates NotFoundException when vehicle not found in fleet', async () => {
      usersRepo.findByIdAndTenant.mockResolvedValue(makeDriverUser());
      fleetDriverRepo.assignDriver.mockRejectedValue(
        new NotFoundException('Vehicle not found in fleet'),
      );

      await expect(service.assignDriver(VEHICLE_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getDriverView — error propagation', () => {
    it('propagates repository errors', async () => {
      fleetDriverRepo.findDriverVehiclesWithPolicies.mockRejectedValue(
        new Error('DB connection error'),
      );

      await expect(service.getDriverView(USER_ID)).rejects.toThrow(
        'DB connection error',
      );
    });
  });
});
