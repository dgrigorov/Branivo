import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeService } from './stripe.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentStatus } from './entities/payment.entity';
import { PoliciesRepository } from '../policies/policies.repository';
import { PolicyEventsRepository } from '../policies/policy-events.repository';
import { PolicyStatus } from '../policies/entities/policy.entity';
import { PolicyEventType } from '../policies/entities/policy-event.entity';
import { QuotesRepository } from '../quotes/quotes.repository';
import { QUEUE_PDF_GENERATION } from '../../infrastructure/queues/queue.module';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PAYMENT_ID = 'payment-uuid-111';
const POLICY_ID = 'policy-uuid-222';
const QUOTE_ID = 'quote-uuid-333';
const INSURER_ID = 'insurer-uuid-444';
const INTENT_ID = 'pi_test_intent_001';
const STRIPE_EVENT_ID = 'evt_test_001';

const mockPayment = {
  id: PAYMENT_ID,
  tenantId: TENANT_ID,
  quoteId: QUOTE_ID,
  endClientId: null,
  stripePaymentIntentId: INTENT_ID,
  amount: '450.00',
  currency: 'BGN',
  applicationFeeAmount: '22.50',
  platformFeePct: '0.0500',
  status: PaymentStatus.PENDING,
  metadata: { insurerCode: 'allianz' },
};

const mockPaymentsRepo = {
  findByStripeIntentId: jest.fn(),
  updateStatus: jest.fn(),
  save: jest.fn(),
};

const mockPoliciesRepo = {
  findByStripeIntentId: jest.fn(),
  saveWithoutTenantScope: jest.fn(),
  activatePolicy: jest.fn(),
};

const mockPolicyEventsRepo = {
  createEvent: jest.fn(),
};

const mockPdfQueue = {
  add: jest.fn(),
};

const mockStripeService = {
  constructWebhookEvent: jest.fn(),
};

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('whsec_test'),
  get: jest.fn(),
};

const mockQuotesRepo = {
  findByIdWithoutScope: jest.fn().mockResolvedValue({ insurerId: INSURER_ID }),
};

describe('StripeWebhookService', () => {
  let service: StripeWebhookService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookService,
        { provide: StripeService, useValue: mockStripeService },
        { provide: PaymentsRepository, useValue: mockPaymentsRepo },
        { provide: PoliciesRepository, useValue: mockPoliciesRepo },
        { provide: PolicyEventsRepository, useValue: mockPolicyEventsRepo },
        { provide: QuotesRepository, useValue: mockQuotesRepo },
        { provide: ConfigService, useValue: mockConfig },
        {
          provide: getQueueToken(QUEUE_PDF_GENERATION),
          useValue: mockPdfQueue,
        },
      ],
    }).compile();

    service = module.get<StripeWebhookService>(StripeWebhookService);
  });

  describe('constructEvent', () => {
    it('calls stripeService.constructWebhookEvent with rawBody and signature', () => {
      const rawBody = Buffer.from('raw');
      const signature = 'sig_test';
      const mockEvent = { type: 'payment_intent.succeeded' } as Stripe.Event;
      mockStripeService.constructWebhookEvent.mockReturnValue(mockEvent);

      const result = service.constructEvent(rawBody, signature);

      expect(mockStripeService.constructWebhookEvent).toHaveBeenCalledWith(
        rawBody,
        signature,
        'whsec_test',
      );
      expect(result).toBe(mockEvent);
    });

    it('propagates error from stripeService (Тест 6 — invalid signature)', () => {
      const rawBody = Buffer.from('raw');
      mockStripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      expect(() => service.constructEvent(rawBody, 'bad_sig')).toThrow(
        'No signatures found matching the expected signature',
      );
    });
  });

  describe('handleEvent — payment_intent.succeeded (AC1)', () => {
    it('Тест 1: activates policy, creates events, queues PDF', async () => {
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(mockPayment);
      mockPoliciesRepo.findByStripeIntentId.mockResolvedValue(null);
      const savedPolicy = { id: POLICY_ID, status: PolicyStatus.ACTIVE };
      mockPoliciesRepo.saveWithoutTenantScope.mockResolvedValue(savedPolicy);
      mockPolicyEventsRepo.createEvent.mockResolvedValue({});
      mockPdfQueue.add.mockResolvedValue({});

      const event = {
        id: STRIPE_EVENT_ID,
        type: 'payment_intent.succeeded',
        data: { object: { id: INTENT_ID, last_payment_error: null } },
      } as unknown as Stripe.Event;

      await service.handleEvent(event);

      expect(mockPaymentsRepo.updateStatus).toHaveBeenCalledWith(
        PAYMENT_ID,
        PaymentStatus.SUCCEEDED,
      );
      expect(mockPoliciesRepo.saveWithoutTenantScope).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PolicyStatus.ACTIVE,
          stripePaymentIntentId: INTENT_ID,
        }),
      );
      expect(mockPoliciesRepo.activatePolicy).not.toHaveBeenCalled();
      expect(mockPolicyEventsRepo.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: PolicyEventType.ACTIVATED }),
      );
      expect(mockPdfQueue.add).toHaveBeenCalledWith(
        'generate-policy-pdf',
        expect.objectContaining({ policyId: POLICY_ID }),
        expect.any(Object),
      );
      expect(mockPolicyEventsRepo.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: PolicyEventType.PDF_QUEUED }),
      );
    });
  });

  describe('handleEvent — idempotency (AC2)', () => {
    it('Тест 2: policy already ACTIVE → no-op, activatePolicy not called', async () => {
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(mockPayment);
      mockPoliciesRepo.findByStripeIntentId.mockResolvedValue({
        id: POLICY_ID,
        status: PolicyStatus.ACTIVE,
      });

      const event = {
        id: STRIPE_EVENT_ID,
        type: 'payment_intent.succeeded',
        data: { object: { id: INTENT_ID } },
      } as unknown as Stripe.Event;

      await service.handleEvent(event);

      expect(mockPoliciesRepo.activatePolicy).not.toHaveBeenCalled();
      expect(mockPoliciesRepo.saveWithoutTenantScope).not.toHaveBeenCalled();
      expect(mockPdfQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('handleEvent — payment_intent.payment_failed (AC4)', () => {
    it('Тест 3: payment failed → updateStatus FAILED, no policy creation', async () => {
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(mockPayment);

      const event = {
        id: STRIPE_EVENT_ID,
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: INTENT_ID,
            last_payment_error: { message: 'Card declined' },
          },
        },
      } as unknown as Stripe.Event;

      await service.handleEvent(event);

      expect(mockPaymentsRepo.updateStatus).toHaveBeenCalledWith(
        PAYMENT_ID,
        PaymentStatus.FAILED,
        'Card declined',
      );
      expect(mockPoliciesRepo.saveWithoutTenantScope).not.toHaveBeenCalled();
      expect(mockPoliciesRepo.activatePolicy).not.toHaveBeenCalled();
    });
  });

  describe('handleEvent — policy events (AC5)', () => {
    it('Тест 4: ACTIVATED + PDF_QUEUED events created on successful activation', async () => {
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(mockPayment);
      mockPoliciesRepo.findByStripeIntentId.mockResolvedValue(null);
      mockPoliciesRepo.saveWithoutTenantScope.mockResolvedValue({
        id: POLICY_ID,
      });
      mockPolicyEventsRepo.createEvent.mockResolvedValue({});
      mockPdfQueue.add.mockResolvedValue({});

      const event = {
        id: STRIPE_EVENT_ID,
        type: 'payment_intent.succeeded',
        data: { object: { id: INTENT_ID } },
      } as unknown as Stripe.Event;

      await service.handleEvent(event);

      const calls = mockPolicyEventsRepo.createEvent.mock.calls as Array<
        [
          {
            eventType: PolicyEventType;
            tenantId: string;
            policyId: string;
          },
        ]
      >;
      const eventTypes = calls.map((c) => c[0].eventType);
      expect(eventTypes).toContain(PolicyEventType.ACTIVATED);
      expect(eventTypes).toContain(PolicyEventType.PDF_QUEUED);
    });
  });

  describe('handleEvent — payment not found (AC3)', () => {
    it('Тест 5: payment not found → early return without error', async () => {
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(null);

      const event = {
        id: STRIPE_EVENT_ID,
        type: 'payment_intent.succeeded',
        data: { object: { id: INTENT_ID } },
      } as unknown as Stripe.Event;

      await expect(service.handleEvent(event)).resolves.not.toThrow();
      expect(mockPoliciesRepo.saveWithoutTenantScope).not.toHaveBeenCalled();
    });
  });

  describe('handleEvent — unknown event type', () => {
    it('unknown event type → handled silently', async () => {
      const event = {
        id: STRIPE_EVENT_ID,
        type: 'customer.created',
        data: { object: {} },
      } as unknown as Stripe.Event;

      await expect(service.handleEvent(event)).resolves.not.toThrow();
      expect(mockPaymentsRepo.findByStripeIntentId).not.toHaveBeenCalled();
    });
  });
});
