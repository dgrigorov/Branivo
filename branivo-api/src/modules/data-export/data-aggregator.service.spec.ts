import { Test, TestingModule } from '@nestjs/testing';
import * as JSZip from 'jszip';
import { DataAggregatorService } from './data-aggregator.service';
import { EndClientRepository } from '../clients/repositories/end-client.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import { PoliciesRepository } from '../policies/policies.repository';
import { PaymentsRepository } from '../payments/payments.repository';
import { EndClient } from '../clients/entities/end-client.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { Policy, PolicyStatus } from '../policies/entities/policy.entity';
import {
  Payment,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from '../payments/entities/payment.entity';

const CUSTOMER_ID = 'customer-uuid';
const TENANT_ID = 'tenant-uuid';

function makeEndClient(overrides: Partial<EndClient> = {}): EndClient {
  return {
    id: CUSTOMER_ID,
    tenantId: TENANT_ID,
    phoneNumber: '+359888000000',
    phoneVerified: true,
    email: 'client@example.com',
    pushToken: 'fcm-token-should-be-excluded',
    firstName: 'Иван',
    lastName: 'Петров',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'vehicle-uuid',
    tenantId: TENANT_ID,
    ownerId: CUSTOMER_ID,
    vin: 'WBA4E1C51FG211234',
    licensePlate: 'СА1234АВ',
    make: 'BMW',
    model: '3 Series',
    year: 2020,
    color: 'Черен',
    engineVolume: '2.0',
    fuelType: 'Дизел',
    firstRegistrationDate: '2020-01-15',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'policy-uuid',
    tenantId: TENANT_ID,
    paymentId: 'payment-uuid',
    quoteId: 'quote-uuid',
    endClientId: CUSTOMER_ID,
    insurerId: 'insurer-uuid',
    policyNumber: 'BG-GO-2024-001',
    status: PolicyStatus.ACTIVE,
    stripePaymentIntentId: 'pi_should_be_excluded',
    premiumAmount: 250.5,
    commissionAmount: 25.05,
    commissionPct: 0.1,
    currency: 'BGN',
    vehicleId: 'vehicle-uuid',
    coverageStartDate: new Date('2024-01-01'),
    coverageEndDate: new Date('2025-01-01'),
    policyPdfS3Key: undefined,
    greenCardPdfS3Key: undefined,
    documentsEmailedAt: undefined,
    deliveryAddress: null,
    metadata: {},
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-uuid',
    tenantId: TENANT_ID,
    quoteId: 'quote-uuid',
    endClientId: CUSTOMER_ID,
    stripePaymentIntentId: 'pi_should_be_excluded',
    idempotencyKey: 'idem-key-should-be-excluded',
    amount: 250.5,
    currency: 'BGN',
    applicationFeeAmount: 25.05,
    platformFeePct: 0.05,
    status: PaymentStatus.SUCCEEDED,
    stripeClientSecret: 'cs_should_be_excluded',
    failureReason: null,
    paymentMethod: PaymentMethod.CARD,
    paymentProvider: PaymentProvider.STRIPE,
    metadata: {},
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

const mockEndClientRepo = { findById: jest.fn() };
const mockVehiclesRepo = { findByOwnerId: jest.fn() };
const mockPoliciesRepo = { findByEndClientId: jest.fn() };
const mockPaymentsRepo = { findByEndClientId: jest.fn() };

describe('DataAggregatorService', () => {
  let service: DataAggregatorService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataAggregatorService,
        { provide: EndClientRepository, useValue: mockEndClientRepo },
        { provide: VehiclesRepository, useValue: mockVehiclesRepo },
        { provide: PoliciesRepository, useValue: mockPoliciesRepo },
        { provide: PaymentsRepository, useValue: mockPaymentsRepo },
      ],
    }).compile();

    service = module.get<DataAggregatorService>(DataAggregatorService);
  });

  it('should call findByOwnerId with correct customerId and tenantId (tenant scoping)', async () => {
    mockEndClientRepo.findById.mockResolvedValue(makeEndClient());
    mockVehiclesRepo.findByOwnerId.mockResolvedValue([makeVehicle()]);
    mockPoliciesRepo.findByEndClientId.mockResolvedValue([makePolicy()]);
    mockPaymentsRepo.findByEndClientId.mockResolvedValue([makePayment()]);

    await service.buildExportZip(CUSTOMER_ID, TENANT_ID);

    expect(mockVehiclesRepo.findByOwnerId).toHaveBeenCalledWith(
      CUSTOMER_ID,
      TENANT_ID,
    );
    expect(mockPoliciesRepo.findByEndClientId).toHaveBeenCalledWith(
      CUSTOMER_ID,
      TENANT_ID,
    );
    expect(mockPaymentsRepo.findByEndClientId).toHaveBeenCalledWith(
      CUSTOMER_ID,
      TENANT_ID,
    );
  });

  it('should include PII fields (VIN, licensePlate) in vehicles.json', async () => {
    mockEndClientRepo.findById.mockResolvedValue(makeEndClient());
    mockVehiclesRepo.findByOwnerId.mockResolvedValue([makeVehicle()]);
    mockPoliciesRepo.findByEndClientId.mockResolvedValue([]);
    mockPaymentsRepo.findByEndClientId.mockResolvedValue([]);

    const buffer = await service.buildExportZip(CUSTOMER_ID, TENANT_ID);

    const zip = await JSZip.loadAsync(buffer);
    const vehiclesJson = await zip.file('vehicles.json')?.async('string');
    expect(vehiclesJson).toBeDefined();
    const vehicles = JSON.parse(vehiclesJson ?? '[]') as Array<
      Record<string, unknown>
    >;
    expect(vehicles[0]).toHaveProperty('vin', 'WBA4E1C51FG211234');
    expect(vehicles[0]).toHaveProperty('licensePlate', 'СА1234АВ');
  });

  it('should exclude stripePaymentIntentId from policies.json', async () => {
    mockEndClientRepo.findById.mockResolvedValue(makeEndClient());
    mockVehiclesRepo.findByOwnerId.mockResolvedValue([]);
    mockPoliciesRepo.findByEndClientId.mockResolvedValue([makePolicy()]);
    mockPaymentsRepo.findByEndClientId.mockResolvedValue([]);

    const buffer = await service.buildExportZip(CUSTOMER_ID, TENANT_ID);

    const zip = await JSZip.loadAsync(buffer);
    const policiesJson = await zip.file('policies.json')?.async('string');
    expect(policiesJson).toBeDefined();
    const policies = JSON.parse(policiesJson ?? '[]') as Array<
      Record<string, unknown>
    >;
    expect(policies[0]).not.toHaveProperty('stripePaymentIntentId');
    expect(policies[0]).not.toHaveProperty('commissionAmount');
    expect(policies[0]).not.toHaveProperty('commissionPct');
    expect(policies[0]).toHaveProperty('policyNumber', 'BG-GO-2024-001');
  });

  it('should exclude Stripe fields from payments.json', async () => {
    mockEndClientRepo.findById.mockResolvedValue(makeEndClient());
    mockVehiclesRepo.findByOwnerId.mockResolvedValue([]);
    mockPoliciesRepo.findByEndClientId.mockResolvedValue([]);
    mockPaymentsRepo.findByEndClientId.mockResolvedValue([makePayment()]);

    const buffer = await service.buildExportZip(CUSTOMER_ID, TENANT_ID);

    const zip = await JSZip.loadAsync(buffer);
    const paymentsJson = await zip.file('payments.json')?.async('string');
    expect(paymentsJson).toBeDefined();
    const payments = JSON.parse(paymentsJson ?? '[]') as Array<
      Record<string, unknown>
    >;
    expect(payments[0]).not.toHaveProperty('stripePaymentIntentId');
    expect(payments[0]).not.toHaveProperty('stripeClientSecret');
    expect(payments[0]).not.toHaveProperty('idempotencyKey');
  });

  it('should return consents.json as empty array placeholder', async () => {
    mockEndClientRepo.findById.mockResolvedValue(makeEndClient());
    mockVehiclesRepo.findByOwnerId.mockResolvedValue([]);
    mockPoliciesRepo.findByEndClientId.mockResolvedValue([]);
    mockPaymentsRepo.findByEndClientId.mockResolvedValue([]);

    const buffer = await service.buildExportZip(CUSTOMER_ID, TENANT_ID);

    const zip = await JSZip.loadAsync(buffer);
    const consentsJson = await zip.file('consents.json')?.async('string');
    expect(consentsJson).toBeDefined();
    const consents = JSON.parse(consentsJson ?? 'null') as unknown[];
    expect(Array.isArray(consents)).toBe(true);
    expect(consents).toHaveLength(0);
  });

  it('should exclude pushToken from profile.json', async () => {
    mockEndClientRepo.findById.mockResolvedValue(makeEndClient());
    mockVehiclesRepo.findByOwnerId.mockResolvedValue([]);
    mockPoliciesRepo.findByEndClientId.mockResolvedValue([]);
    mockPaymentsRepo.findByEndClientId.mockResolvedValue([]);

    const buffer = await service.buildExportZip(CUSTOMER_ID, TENANT_ID);

    const zip = await JSZip.loadAsync(buffer);
    const profileJson = await zip.file('profile.json')?.async('string');
    expect(profileJson).toBeDefined();
    const profile = JSON.parse(profileJson ?? 'null') as Record<
      string,
      unknown
    > | null;
    expect(profile).not.toBeNull();
    expect(profile).not.toHaveProperty('pushToken');
    expect(profile).toHaveProperty('email', 'client@example.com');
  });
});
