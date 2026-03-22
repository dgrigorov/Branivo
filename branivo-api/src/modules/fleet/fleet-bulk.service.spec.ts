/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { FleetBulkService } from './fleet-bulk.service';
import { FleetRepository } from './fleet.repository';
import { QuotesService } from '../quotes/quotes.service';
import { PaymentsService } from '../payments/payments.service';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { QuoteStatus } from '../quotes/entities/quote.entity';
import type { FleetVehicleWithVehicleData } from './fleet.repository';

const TENANT_ID = 'tenant-uuid-001';

function makeFleetVehicle(
  overrides: Partial<FleetVehicleWithVehicleData> = {},
): FleetVehicleWithVehicleData {
  return {
    id: 'fv-id-1',
    vehicle_id: 'v-id-1',
    license_plate: 'СА1234АВ',
    make: 'Toyota',
    model: 'Corolla',
    vin: 'ABCDEFGH123456789',
    year: 2020,
    ...overrides,
  };
}

const mockQuoteResponse = {
  sessionToken: 'fleet-bulk-fv-id-1-12345',
  status: 'complete' as const,
  requestedAt: new Date().toISOString(),
  offers: [
    {
      id: 'quote-uuid-1',
      insurerCode: 'allianz',
      insurerName: 'Allianz',
      price: 450,
      currency: 'BGN',
      score: 0.9,
      isRecommended: true,
      status: QuoteStatus.SUCCESS,
      extras: {},
    },
  ],
};

describe('FleetBulkService', () => {
  let service: FleetBulkService;
  let fleetRepo: jest.Mocked<FleetRepository>;
  let quotesService: jest.Mocked<QuotesService>;
  let paymentsService: jest.Mocked<PaymentsService>;
  let tenantContext: jest.Mocked<TenantContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FleetBulkService,
        {
          provide: FleetRepository,
          useValue: { findManyByIds: jest.fn() },
        },
        {
          provide: QuotesService,
          useValue: { createQuoteRequest: jest.fn() },
        },
        {
          provide: PaymentsService,
          useValue: { createIntent: jest.fn() },
        },
        {
          provide: TenantContext,
          useValue: { getTenantId: jest.fn().mockReturnValue(TENANT_ID) },
        },
      ],
    }).compile();

    service = module.get(FleetBulkService);
    fleetRepo = module.get(FleetRepository);
    quotesService = module.get(QuotesService);
    paymentsService = module.get(PaymentsService);
    tenantContext = module.get(TenantContext);
  });

  describe('bulkGetQuotes', () => {
    it('scopes fleet vehicle lookup to tenant', async () => {
      fleetRepo.findManyByIds.mockResolvedValue([makeFleetVehicle()]);
      quotesService.createQuoteRequest.mockResolvedValue(mockQuoteResponse);

      await service.bulkGetQuotes(['fv-id-1']);

      expect(tenantContext.getTenantId).toHaveBeenCalled();
      expect(fleetRepo.findManyByIds).toHaveBeenCalledWith(TENANT_ID, [
        'fv-id-1',
      ]);
    });

    it('calls QuotesService for each fleet vehicle in parallel', async () => {
      const vehicles = [
        makeFleetVehicle({ id: 'fv-1' }),
        makeFleetVehicle({ id: 'fv-2', license_plate: 'СА5678АВ' }),
      ];
      fleetRepo.findManyByIds.mockResolvedValue(vehicles);
      quotesService.createQuoteRequest.mockResolvedValue(mockQuoteResponse);

      const result = await service.bulkGetQuotes(['fv-1', 'fv-2']);

      expect(quotesService.createQuoteRequest).toHaveBeenCalledTimes(2);
      expect(result.results).toHaveLength(2);
    });

    it('returns failed status when QuotesService throws', async () => {
      fleetRepo.findManyByIds.mockResolvedValue([makeFleetVehicle()]);
      quotesService.createQuoteRequest.mockRejectedValue(
        new Error('Insurer unavailable'),
      );

      const result = await service.bulkGetQuotes(['fv-id-1']);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[0].offers).toHaveLength(0);
    });

    it('returns partial status when some offers fail', async () => {
      fleetRepo.findManyByIds.mockResolvedValue([makeFleetVehicle()]);
      quotesService.createQuoteRequest.mockResolvedValue({
        ...mockQuoteResponse,
        offers: [
          { ...mockQuoteResponse.offers[0], status: QuoteStatus.SUCCESS },
          {
            id: 'quote-uuid-2',
            insurerCode: 'generali',
            insurerName: 'Generali',
            price: null,
            currency: 'BGN',
            score: null,
            isRecommended: false,
            status: QuoteStatus.ERROR,
            extras: {},
            errorReason: 'unavailable' as const,
          },
        ],
      });

      const result = await service.bulkGetQuotes(['fv-id-1']);

      expect(result.results[0].status).toBe('partial');
    });

    it('returns empty results when no fleet vehicles found for tenant', async () => {
      fleetRepo.findManyByIds.mockResolvedValue([]);

      const result = await service.bulkGetQuotes(['unknown-fv-id']);

      expect(quotesService.createQuoteRequest).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(0);
    });
  });

  describe('bulkPurchase', () => {
    it('calls PaymentsService for each item in parallel', async () => {
      paymentsService.createIntent.mockResolvedValue({
        clientSecret: 'pi_secret',
        paymentId: 'pi_123',
        amount: 450,
        currency: 'BGN',
      });

      const items = [
        { vehicleId: 'fv-1', quoteId: 'q-1' },
        { vehicleId: 'fv-2', quoteId: 'q-2' },
      ];

      const result = await service.bulkPurchase(items);

      expect(paymentsService.createIntent).toHaveBeenCalledTimes(2);
      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    });

    it('returns partial success when some payments fail', async () => {
      paymentsService.createIntent
        .mockResolvedValueOnce({
          clientSecret: 'pi_secret_1',
          paymentId: 'pi_123',
          amount: 450,
          currency: 'BGN',
        })
        .mockRejectedValueOnce(
          new Error('Quote is not available for purchase'),
        );

      const items = [
        { vehicleId: 'fv-1', quoteId: 'q-1' },
        { vehicleId: 'fv-2', quoteId: 'q-2' },
      ];

      const result = await service.bulkPurchase(items);

      expect(result.succeeded).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].vehicleId).toBe('fv-2');
      expect(result.failed[0].error).toBe(
        'Quote is not available for purchase',
      );
      expect(result.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    });

    it('never throws even when all payments fail', async () => {
      paymentsService.createIntent.mockRejectedValue(
        new Error('Stripe unavailable'),
      );

      const items = [{ vehicleId: 'fv-1', quoteId: 'q-1' }];

      await expect(service.bulkPurchase(items)).resolves.toMatchObject({
        succeeded: [],
        failed: [{ vehicleId: 'fv-1', quoteId: 'q-1' }],
        summary: { total: 1, succeeded: 0, failed: 1 },
      });
    });

    it('idempotency — existing payment returned for succeeded quote', async () => {
      // PaymentsService already handles idempotency: returns existing PI if key exists
      paymentsService.createIntent.mockResolvedValue({
        clientSecret: 'pi_existing_secret',
        paymentId: 'pi_existing',
        amount: 450,
        currency: 'BGN',
      });

      const items = [{ vehicleId: 'fv-1', quoteId: 'q-1' }];

      const result1 = await service.bulkPurchase(items);
      const result2 = await service.bulkPurchase(items);

      // Both calls succeed — PaymentsService returns existing PI on second call
      expect(result1.succeeded[0].paymentId).toBe('pi_existing');
      expect(result2.succeeded[0].paymentId).toBe('pi_existing');
      expect(result1.summary.succeeded).toBe(1);
      expect(result2.summary.succeeded).toBe(1);
    });
  });
});
