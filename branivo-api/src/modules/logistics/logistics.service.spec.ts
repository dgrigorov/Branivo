/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { LogisticsService } from './logistics.service';
import { ShipmentsRepository } from './shipments.repository';
import { PoliciesRepository } from '../policies/policies.repository';
import { TenantsRepository } from '../tenants/tenants.repository';
import { SpeedyAdapter } from './adapters/speedy.adapter';
import { EcontAdapter } from './adapters/econt.adapter';
import { ManualAdapter } from './adapters/manual.adapter';
import { Shipment } from './entities/shipment.entity';
import { Policy, PolicyStatus } from '../policies/entities/policy.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { DeliveryAddress } from './interfaces/delivery-address.interface';
import { StickerDeliveryJobPayload } from './interfaces/sticker-delivery-job.payload';

const mockDeliveryAddress: DeliveryAddress = {
  recipientName: 'Иван Иванов',
  phone: '+359888123456',
  city: 'София',
  postCode: '1000',
  addressLine: 'ул. Витоша 1',
};

const mockShipment: Shipment = {
  id: 'shipment-id-1',
  tenantId: 'tenant-id-1',
  policyId: 'policy-id-1',
  provider: 'speedy',
  trackingNumber: null,
  estimatedDeliveryDate: null,
  status: 'pending',
  receiptS3Key: null,
  deliveryAddress: mockDeliveryAddress,
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockPolicy: Policy = {
  id: 'policy-id-1',
  tenantId: 'tenant-id-1',
  paymentId: 'payment-id-1',
  quoteId: 'quote-id-1',
  endClientId: 'client-id-1',
  insurerId: 'insurer-id-1',
  policyNumber: 'DEMO-001',
  status: PolicyStatus.ACTIVE,
  stripePaymentIntentId: 'pi_test_1',
  premiumAmount: 500,
  commissionAmount: 25,
  commissionPct: 0.05,
  currency: 'BGN',
  deliveryAddress: mockDeliveryAddress,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockTenantWithSticker: Partial<Tenant> = {
  id: 'tenant-id-1',
  features: { sticker_delivery: true },
};

const mockTenantWithoutSticker: Partial<Tenant> = {
  id: 'tenant-id-1',
  features: { sticker_delivery: false },
};

const payload: StickerDeliveryJobPayload = {
  tenantId: 'tenant-id-1',
  policyId: 'policy-id-1',
  policyNumber: 'DEMO-001',
};

describe('LogisticsService', () => {
  let service: LogisticsService;
  let shipmentsRepo: jest.Mocked<ShipmentsRepository>;
  let policiesRepo: jest.Mocked<PoliciesRepository>;
  let tenantsRepo: jest.Mocked<TenantsRepository>;
  let speedyAdapter: jest.Mocked<SpeedyAdapter>;
  let econtAdapter: jest.Mocked<EcontAdapter>;
  let manualAdapter: jest.Mocked<ManualAdapter>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogisticsService,
        {
          provide: ShipmentsRepository,
          useValue: {
            createShipment: jest.fn(),
            updateShipmentTracking: jest.fn(),
            findByPolicyIdForTenant: jest.fn(),
          },
        },
        {
          provide: PoliciesRepository,
          useValue: {
            findByIdWithoutScope: jest.fn(),
          },
        },
        {
          provide: TenantsRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: SpeedyAdapter,
          useValue: { createDelivery: jest.fn() },
        },
        {
          provide: EcontAdapter,
          useValue: { createDelivery: jest.fn() },
        },
        {
          provide: ManualAdapter,
          useValue: { createDelivery: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<LogisticsService>(LogisticsService);
    shipmentsRepo = module.get(ShipmentsRepository);
    policiesRepo = module.get(PoliciesRepository);
    tenantsRepo = module.get(TenantsRepository);
    speedyAdapter = module.get(SpeedyAdapter);
    econtAdapter = module.get(EcontAdapter);
    manualAdapter = module.get(ManualAdapter);
  });

  describe('initiateDelivery', () => {
    it('calls SpeedyAdapter and updates shipment to dispatched when sticker_delivery is enabled', async () => {
      tenantsRepo.findById.mockResolvedValue(mockTenantWithSticker as Tenant);
      policiesRepo.findByIdWithoutScope.mockResolvedValue(mockPolicy);
      shipmentsRepo.createShipment.mockResolvedValue(mockShipment);
      speedyAdapter.createDelivery.mockResolvedValue({
        trackingNumber: 'SPEEDY-123',
        estimatedDeliveryDate: new Date('2026-03-25'),
        provider: 'speedy',
      });

      await service.initiateDelivery(payload);

      expect(speedyAdapter.createDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-id-1',
          policyId: 'policy-id-1',
          policyNumber: 'DEMO-001',
          deliveryAddress: mockDeliveryAddress,
        }),
      );
      expect(shipmentsRepo.updateShipmentTracking).toHaveBeenCalledWith(
        mockShipment.id,
        'SPEEDY-123',
        expect.any(Date),
        'dispatched',
      );
    });

    it('returns early (no-op) when sticker_delivery is disabled (AC2 double-check)', async () => {
      tenantsRepo.findById.mockResolvedValue(
        mockTenantWithoutSticker as Tenant,
      );

      await service.initiateDelivery(payload);

      expect(policiesRepo.findByIdWithoutScope).not.toHaveBeenCalled();
      expect(shipmentsRepo.createShipment).not.toHaveBeenCalled();
      expect(speedyAdapter.createDelivery).not.toHaveBeenCalled();
    });

    it('falls back to ManualAdapter when delivery_address is null', async () => {
      tenantsRepo.findById.mockResolvedValue(mockTenantWithSticker as Tenant);
      policiesRepo.findByIdWithoutScope.mockResolvedValue({
        ...mockPolicy,
        deliveryAddress: null,
      });
      manualAdapter.createDelivery.mockResolvedValue({
        trackingNumber: null,
        estimatedDeliveryDate: null,
        provider: 'manual',
      });

      await service.initiateDelivery(payload);

      expect(manualAdapter.createDelivery).toHaveBeenCalled();
      expect(speedyAdapter.createDelivery).not.toHaveBeenCalled();
      expect(shipmentsRepo.createShipment).not.toHaveBeenCalled();
    });

    it('creates Shipment record with dispatched status on success', async () => {
      tenantsRepo.findById.mockResolvedValue(mockTenantWithSticker as Tenant);
      policiesRepo.findByIdWithoutScope.mockResolvedValue(mockPolicy);
      shipmentsRepo.createShipment.mockResolvedValue(mockShipment);
      speedyAdapter.createDelivery.mockResolvedValue({
        trackingNumber: 'SPD-999',
        estimatedDeliveryDate: new Date('2026-03-26'),
        provider: 'speedy',
      });

      await service.initiateDelivery(payload);

      expect(shipmentsRepo.createShipment).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-id-1',
          policyId: 'policy-id-1',
          provider: 'speedy',
          deliveryAddress: mockDeliveryAddress,
        }),
      );
      expect(shipmentsRepo.updateShipmentTracking).toHaveBeenCalledWith(
        mockShipment.id,
        'SPD-999',
        expect.any(Date),
        'dispatched',
      );
    });

    it('updates Shipment to failed and triggers ManualAdapter on adapter error', async () => {
      tenantsRepo.findById.mockResolvedValue(mockTenantWithSticker as Tenant);
      policiesRepo.findByIdWithoutScope.mockResolvedValue(mockPolicy);
      shipmentsRepo.createShipment.mockResolvedValue(mockShipment);
      speedyAdapter.createDelivery.mockRejectedValue(
        new Error('Speedy API error: HTTP 503'),
      );
      manualAdapter.createDelivery.mockResolvedValue({
        trackingNumber: null,
        estimatedDeliveryDate: null,
        provider: 'manual',
      });

      await expect(service.initiateDelivery(payload)).rejects.toThrow(
        'Speedy API error: HTTP 503',
      );

      expect(shipmentsRepo.updateShipmentTracking).toHaveBeenCalledWith(
        mockShipment.id,
        null,
        null,
        'failed',
        'Speedy API error: HTTP 503',
      );
      expect(manualAdapter.createDelivery).toHaveBeenCalled();
    });
  });

  describe('SpeedyAdapter timeout behavior', () => {
    it('throws error when SpeedyAdapter call fails (simulating timeout)', async () => {
      tenantsRepo.findById.mockResolvedValue(mockTenantWithSticker as Tenant);
      policiesRepo.findByIdWithoutScope.mockResolvedValue(mockPolicy);
      shipmentsRepo.createShipment.mockResolvedValue(mockShipment);
      speedyAdapter.createDelivery.mockRejectedValue(
        new Error('Speedy API request failed: The operation was aborted.'),
      );
      manualAdapter.createDelivery.mockResolvedValue({
        trackingNumber: null,
        estimatedDeliveryDate: null,
        provider: 'manual',
      });

      await expect(service.initiateDelivery(payload)).rejects.toThrow(
        'Speedy API request failed',
      );
    });
  });

  it('is defined', () => {
    expect(service).toBeDefined();
    expect(econtAdapter).toBeDefined(); // referenced to avoid unused import
  });
});
