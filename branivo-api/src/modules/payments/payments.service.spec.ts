import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './payments.repository';
import { StripeService } from './stripe.service';
import { QuotesRepository } from '../quotes/quotes.repository';
import { TenantsRepository } from '../tenants/tenants.repository';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { Payment } from './entities/payment.entity';
import { QuoteStatus } from '../quotes/entities/quote.entity';
import type { Quote } from '../quotes/entities/quote.entity';
import type { Tenant } from '../tenants/entities/tenant.entity';
import type Stripe from 'stripe';

const TENANT_ID = 'tenant-uuid-001';
const QUOTE_ID = 'quote-uuid-001';
const IDEMPOTENCY_KEY = `${TENANT_ID}:${QUOTE_ID}`;

const makeQuote = (
  status: QuoteStatus = QuoteStatus.SUCCESS,
  price: number | null = 450,
): Quote =>
  ({
    id: QUOTE_ID,
    tenantId: TENANT_ID,
    sessionToken: 'session-token',
    vehicleId: null,
    insurerId: 'insurer-uuid',
    insurer: { code: 'allianz' },
    status,
    price,
    currency: 'BGN',
    coverDetails: {},
    extras: {},
    score: null,
    isRecommended: false,
    rawResponse: null,
    errorMessage: null,
    expiresAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }) as Quote;

const makeTenant = (stripeAccountId: string | null = 'acct_test123'): Tenant =>
  ({
    id: TENANT_ID,
    slug: 'demo',
    name: 'Demo Broker',
    status: 'active',
    stripeAccountId,
    kfnLicense: null,
    plan: 'starter',
    features: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }) as Tenant;

const mockStripeService = {
  createPaymentIntent: jest.fn(),
};

const mockPaymentsRepo = {
  findByIdempotencyKey: jest.fn(),
  save: jest.fn(),
};

const mockQuotesRepo = {
  findOneById: jest.fn(),
};

const mockTenantsRepo = {
  findById: jest.fn(),
};

const mockTenantContext = {
  getTenantId: jest.fn().mockReturnValue(TENANT_ID),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('0.05'),
  getOrThrow: jest.fn(),
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContext.getTenantId.mockReturnValue(TENANT_ID);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentsRepository, useValue: mockPaymentsRepo },
        { provide: QuotesRepository, useValue: mockQuotesRepo },
        { provide: TenantsRepository, useValue: mockTenantsRepo },
        { provide: StripeService, useValue: mockStripeService },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('createIntent', () => {
    it('returns existing payment without new Stripe call if idempotency key exists', async () => {
      const existingPayment = {
        id: 'payment-uuid',
        stripePaymentIntentId: 'pi_existing_intent',
        stripeClientSecret: 'pi_test_secret_existing',
        amount: 450,
        currency: 'BGN',
      } as Payment;

      mockPaymentsRepo.findByIdempotencyKey.mockResolvedValue(existingPayment);

      const result = await service.createIntent({ quoteId: QUOTE_ID });

      expect(mockPaymentsRepo.findByIdempotencyKey).toHaveBeenCalledWith(
        IDEMPOTENCY_KEY,
      );
      expect(mockStripeService.createPaymentIntent).not.toHaveBeenCalled();
      expect(result).toEqual({
        clientSecret: 'pi_test_secret_existing',
        paymentId: 'pi_existing_intent', // H1 fix: consistent Stripe PI ID
        amount: 450,
        currency: 'BGN',
      });
    });

    it('creates new PaymentIntent with correct amountCents and feeCents', async () => {
      mockPaymentsRepo.findByIdempotencyKey.mockResolvedValue(null);
      mockQuotesRepo.findOneById.mockResolvedValue(makeQuote());
      mockTenantsRepo.findById.mockResolvedValue(makeTenant());
      mockStripeService.createPaymentIntent.mockResolvedValue({
        id: 'pi_test_new',
        client_secret: 'pi_test_new_secret',
      } as Partial<Stripe.PaymentIntent>);
      mockPaymentsRepo.save.mockResolvedValue({} as Payment);

      const result = await service.createIntent({ quoteId: QUOTE_ID });

      // amountCents = round(450 * 100) = 45000
      // feeCents = round(45000 * 0.05) = 2250
      expect(mockStripeService.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 45000,
          currency: 'BGN',
          applicationFeeAmount: 2250,
          stripeAccountId: 'acct_test123',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      );
      expect(result.clientSecret).toBe('pi_test_new_secret');
      expect(result.paymentId).toBe('pi_test_new');
    });

    it('throws BadRequestException when quote status is not success', async () => {
      mockPaymentsRepo.findByIdempotencyKey.mockResolvedValue(null);
      mockQuotesRepo.findOneById.mockResolvedValue(
        makeQuote(QuoteStatus.ERROR, null),
      );

      await expect(service.createIntent({ quoteId: QUOTE_ID })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when tenant has no stripeAccountId', async () => {
      mockPaymentsRepo.findByIdempotencyKey.mockResolvedValue(null);
      mockQuotesRepo.findOneById.mockResolvedValue(makeQuote());
      mockTenantsRepo.findById.mockResolvedValue(makeTenant(null));

      await expect(service.createIntent({ quoteId: QUOTE_ID })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('tenantId comes from TenantContext.getTenantId() not from parameter', async () => {
      const differentTenantId = 'different-tenant-uuid';
      mockTenantContext.getTenantId.mockReturnValue(differentTenantId);
      mockPaymentsRepo.findByIdempotencyKey.mockResolvedValue(null);
      mockQuotesRepo.findOneById.mockResolvedValue(makeQuote());
      mockTenantsRepo.findById.mockResolvedValue(makeTenant());
      mockStripeService.createPaymentIntent.mockResolvedValue({
        id: 'pi_test',
        client_secret: 'pi_secret',
      } as Partial<Stripe.PaymentIntent>);
      mockPaymentsRepo.save.mockResolvedValue({} as Payment);

      await service.createIntent({ quoteId: QUOTE_ID });

      expect(mockPaymentsRepo.findByIdempotencyKey).toHaveBeenCalledWith(
        `${differentTenantId}:${QUOTE_ID}`,
      );
      expect(mockStripeService.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tenantId: differentTenantId,
          }) as Record<string, string>,
        }),
      );
    });
  });
});
