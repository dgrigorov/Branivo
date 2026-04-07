import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeService } from './stripe.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentMethod, PaymentStatus } from './entities/payment.entity';
import { PoliciesRepository } from '../policies/policies.repository';
import { PolicyEventsRepository } from '../policies/policy-events.repository';
import { PolicyStatus } from '../policies/entities/policy.entity';
import { PolicyEventType } from '../policies/entities/policy-event.entity';
import { QuotesRepository } from '../quotes/quotes.repository';
import { TenantsRepository } from '../tenants/tenants.repository';
import {
  QUEUE_LOGISTICS,
  QUEUE_PDF_GENERATION,
} from '../../infrastructure/queues/queue.module';
import { CommissionsService } from '../commissions/commissions.service';
import { AuditService } from '../../common/audit/audit.service';
import { EmailService } from '../../infrastructure/email/email.service';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const STRIPE_ACCOUNT_ID = 'acct_test_001';
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
  updatePaymentMethod: jest.fn(),
  save: jest.fn(),
};

const mockPoliciesRepo = {
  findByStripeIntentId: jest.fn(),
  saveWithoutTenantScope: jest.fn(),
  activatePolicy: jest.fn(),
};

const mockPolicyEventsRepo = {
  findByStripeEventId: jest.fn(),
  createEvent: jest.fn(),
};

const mockPdfQueue = {
  add: jest.fn(),
};

const mockStripeService = {
  constructWebhookEvent: jest.fn(),
  // Returns PaymentIntent with expanded payment_method for wallet type detection.
  // Default: regular card (no wallet). Override per-test for Apple Pay / Google Pay.
  retrievePaymentIntentWithMethod: jest
    .fn()
    .mockResolvedValue({ payment_method: { card: {} } }),
};

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('whsec_test'),
  get: jest.fn(),
};

const mockQuotesRepo = {
  findByIdWithoutScope: jest.fn().mockResolvedValue({ insurerId: INSURER_ID }),
};

const mockTenantsRepo = {
  findById: jest
    .fn()
    .mockResolvedValue({ features: { sticker_delivery: false } }),
  findByStripeAccountId: jest.fn(),
  updateStatus: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn(),
  query: jest.fn(),
};

const mockEmailService = {
  sendStripeRevocationEmail: jest.fn(),
};

const mockLogisticsQueue = {
  add: jest.fn(),
};

const mockCommissionsService = {
  confirmPendingEvent: jest.fn().mockResolvedValue(undefined),
  failPendingEvent: jest.fn().mockResolvedValue(undefined),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
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
        { provide: TenantsRepository, useValue: mockTenantsRepo },
        { provide: ConfigService, useValue: mockConfig },
        { provide: CommissionsService, useValue: mockCommissionsService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: AuditService, useValue: mockAuditService },
        { provide: EmailService, useValue: mockEmailService },
        {
          provide: getQueueToken(QUEUE_PDF_GENERATION),
          useValue: mockPdfQueue,
        },
        {
          provide: getQueueToken(QUEUE_LOGISTICS),
          useValue: mockLogisticsQueue,
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
      mockPolicyEventsRepo.findByStripeEventId.mockResolvedValue(null);
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(mockPayment);
      mockPoliciesRepo.findByStripeIntentId.mockResolvedValue(null);
      const savedPolicy = {
        id: POLICY_ID,
        tenantId: TENANT_ID,
        policyNumber: 'DEMO-001',
        status: PolicyStatus.ACTIVE,
        deliveryAddress: null,
      };
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
      expect(mockCommissionsService.confirmPendingEvent).toHaveBeenCalledWith(
        PAYMENT_ID,
        TENANT_ID,
      );
    });
  });

  describe('handleEvent — idempotency (AC2)', () => {
    it('Тест 2: policy already ACTIVE → no-op, activatePolicy not called', async () => {
      mockPolicyEventsRepo.findByStripeEventId.mockResolvedValue(null);
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
      expect(mockPolicyEventsRepo.createEvent).not.toHaveBeenCalled();
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
      expect(mockCommissionsService.failPendingEvent).toHaveBeenCalledWith(
        PAYMENT_ID,
        TENANT_ID,
      );
    });

    it('AC4: duplicate payment_failed event (already FAILED) → idempotency skip, no double failPendingEvent', async () => {
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.FAILED,
      });

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

      expect(mockPaymentsRepo.updateStatus).not.toHaveBeenCalled();
      expect(mockCommissionsService.failPendingEvent).not.toHaveBeenCalled();
    });
  });

  describe('handleEvent — policy events (AC5)', () => {
    it('Тест 4: ACTIVATED + PDF_QUEUED events created on successful activation', async () => {
      mockPolicyEventsRepo.findByStripeEventId.mockResolvedValue(null);
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(mockPayment);
      mockPoliciesRepo.findByStripeIntentId.mockResolvedValue(null);
      mockPoliciesRepo.saveWithoutTenantScope.mockResolvedValue({
        id: POLICY_ID,
        policyNumber: 'DEMO-001',
        deliveryAddress: null,
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
      mockPolicyEventsRepo.findByStripeEventId.mockResolvedValue(null);
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

  describe('handleAccountUpdated — account.updated (AC1, AC4, AC5)', () => {
    const mockTenant = {
      id: TENANT_ID,
      name: 'Demo Broker',
      status: 'active',
      stripeAccountId: STRIPE_ACCOUNT_ID,
    };

    const makeAccountEvent = (chargesEnabled: boolean): Stripe.Event =>
      ({
        id: STRIPE_EVENT_ID,
        type: 'account.updated',
        data: {
          object: {
            id: STRIPE_ACCOUNT_ID,
            charges_enabled: chargesEnabled,
          },
        },
      }) as unknown as Stripe.Event;

    beforeEach(() => {
      mockDataSource.query.mockResolvedValue([{ email: 'broker@demo.com' }]);
      mockEmailService.sendStripeRevocationEmail.mockResolvedValue(undefined);
      mockTenantsRepo.updateStatus.mockResolvedValue(undefined);
    });

    it('AC1: charges_enabled=false → updateStatus("stripe_revoked") + audit_log + email', async () => {
      mockTenantsRepo.findByStripeAccountId.mockResolvedValue({
        ...mockTenant,
        status: 'active',
      });

      await service.handleEvent(makeAccountEvent(false));

      expect(mockTenantsRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'stripe_revoked',
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          action: 'stripe_account_revoked',
        }),
      );
      expect(mockEmailService.sendStripeRevocationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ isRevoked: true, to: 'broker@demo.com' }),
      );
    });

    it('AC4: charges_enabled=true → updateStatus("active") + audit_log + email (reinstatement)', async () => {
      mockTenantsRepo.findByStripeAccountId.mockResolvedValue({
        ...mockTenant,
        status: 'stripe_revoked',
      });

      await service.handleEvent(makeAccountEvent(true));

      expect(mockTenantsRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        'active',
      );
      expect(mockEmailService.sendStripeRevocationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ isRevoked: false }),
      );
    });

    it('AC4: already stripe_revoked + new revocation event → [IDEMPOTENCY] skip, no update or email', async () => {
      mockTenantsRepo.findByStripeAccountId.mockResolvedValue({
        ...mockTenant,
        status: 'stripe_revoked',
      });
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      await service.handleEvent(makeAccountEvent(false));

      expect(mockTenantsRepo.updateStatus).not.toHaveBeenCalled();
      expect(mockEmailService.sendStripeRevocationEmail).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[IDEMPOTENCY]'),
      );
    });

    it('Tenant not found → warn log, no error, no updateStatus', async () => {
      mockTenantsRepo.findByStripeAccountId.mockResolvedValue(null);

      await expect(
        service.handleEvent(makeAccountEvent(false)),
      ).resolves.not.toThrow();
      expect(mockTenantsRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('AC5: auditService.log called with correct parameters on revocation', async () => {
      mockTenantsRepo.findByStripeAccountId.mockResolvedValue({
        ...mockTenant,
        status: 'active',
      });

      await service.handleEvent(makeAccountEvent(false));

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          action: 'stripe_account_revoked',
          entityType: 'tenant',
          entityId: TENANT_ID,
          metadata: expect.objectContaining({
            stripeEventId: STRIPE_EVENT_ID,
            stripeAccountId: STRIPE_ACCOUNT_ID,
            chargesEnabled: false,
          }) as Record<string, unknown>,
        }),
      );
    });

    it('No broker_admin email found → logs warn, skips email, no error', async () => {
      mockTenantsRepo.findByStripeAccountId.mockResolvedValue({
        ...mockTenant,
        status: 'active',
      });
      // Override: no broker_admin found in users table
      mockDataSource.query.mockResolvedValueOnce([]); // SELECT email FROM users → empty

      await expect(
        service.handleEvent(makeAccountEvent(false)),
      ).resolves.not.toThrow();
      expect(mockEmailService.sendStripeRevocationEmail).not.toHaveBeenCalled();
    });
  });

  describe('handleEvent — payment_method recording (AC7)', () => {
    // Stripe ALWAYS sends payment_method_types: ['card'] even for Apple Pay / Google Pay.
    // Wallet type is detected via expanded payment_method.card.wallet.type.
    const makeSucceededEvent = (): Stripe.Event =>
      ({
        id: STRIPE_EVENT_ID,
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: INTENT_ID,
            payment_method_types: ['card'], // Always 'card' from Stripe for all wallet types
          },
        },
      }) as unknown as Stripe.Event;

    beforeEach(() => {
      mockPolicyEventsRepo.findByStripeEventId.mockResolvedValue(null);
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(mockPayment);
      mockPoliciesRepo.findByStripeIntentId.mockResolvedValue(null);
      mockPoliciesRepo.saveWithoutTenantScope.mockResolvedValue({
        id: POLICY_ID,
        policyNumber: 'DEMO-001',
        deliveryAddress: null,
      });
      mockPolicyEventsRepo.createEvent.mockResolvedValue({});
      mockPdfQueue.add.mockResolvedValue({});
      mockPaymentsRepo.updatePaymentMethod.mockResolvedValue(undefined);
    });

    it('AC7: Apple Pay → updatePaymentMethod called with PaymentMethod.APPLE_PAY (via card.wallet.type)', async () => {
      mockStripeService.retrievePaymentIntentWithMethod.mockResolvedValue({
        payment_method: { card: { wallet: { type: 'apple_pay' } } },
      });

      await service.handleEvent(makeSucceededEvent());

      expect(mockPaymentsRepo.updatePaymentMethod).toHaveBeenCalledWith(
        PAYMENT_ID,
        PaymentMethod.APPLE_PAY,
      );
    });

    it('AC7: Google Pay → updatePaymentMethod called with PaymentMethod.GOOGLE_PAY (via card.wallet.type)', async () => {
      mockStripeService.retrievePaymentIntentWithMethod.mockResolvedValue({
        payment_method: { card: { wallet: { type: 'google_pay' } } },
      });

      await service.handleEvent(makeSucceededEvent());

      expect(mockPaymentsRepo.updatePaymentMethod).toHaveBeenCalledWith(
        PAYMENT_ID,
        PaymentMethod.GOOGLE_PAY,
      );
    });

    it('AC7: regular card (no wallet) → updatePaymentMethod called with PaymentMethod.CARD', async () => {
      mockStripeService.retrievePaymentIntentWithMethod.mockResolvedValue({
        payment_method: { card: {} }, // No wallet property
      });

      await service.handleEvent(makeSucceededEvent());

      expect(mockPaymentsRepo.updatePaymentMethod).toHaveBeenCalledWith(
        PAYMENT_ID,
        PaymentMethod.CARD,
      );
    });

    it('AC7: retrievePaymentIntentWithMethod fails gracefully → defaults to PaymentMethod.CARD', async () => {
      mockStripeService.retrievePaymentIntentWithMethod.mockRejectedValue(
        new Error('Stripe API timeout'),
      );

      await service.handleEvent(makeSucceededEvent());

      // Must NOT throw — webhook must complete; defaults to 'card'
      expect(mockPaymentsRepo.updatePaymentMethod).toHaveBeenCalledWith(
        PAYMENT_ID,
        PaymentMethod.CARD,
      );
    });
  });

  describe('handleEvent — stripe_event_id idempotency (AC1, AC5)', () => {
    const makeSucceededEvent = (): Stripe.Event =>
      ({
        id: STRIPE_EVENT_ID,
        type: 'payment_intent.succeeded',
        data: { object: { id: INTENT_ID } },
      }) as unknown as Stripe.Event;

    it('AC1: duplicate stripe_event_id → early return, no policy activation or events created', async () => {
      // Simulate: event already processed (policy_event with this stripe_event_id exists)
      mockPolicyEventsRepo.findByStripeEventId.mockResolvedValue({
        id: 'existing-evt-uuid',
        stripeEventId: STRIPE_EVENT_ID,
      });

      await service.handleEvent(makeSucceededEvent());

      // CRITICAL: none of these should be called after idempotency check
      expect(mockPaymentsRepo.findByStripeIntentId).not.toHaveBeenCalled();
      expect(mockPoliciesRepo.saveWithoutTenantScope).not.toHaveBeenCalled();
      expect(mockPolicyEventsRepo.createEvent).not.toHaveBeenCalled();
    });

    it('AC1: duplicate stripe_event_id → logs [IDEMPOTENCY] skip message', async () => {
      mockPolicyEventsRepo.findByStripeEventId.mockResolvedValue({
        id: 'existing-evt-uuid',
        stripeEventId: STRIPE_EVENT_ID,
      });
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      await service.handleEvent(makeSucceededEvent());

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[IDEMPOTENCY]'),
      );
    });

    it('AC3: race condition — UniqueConstraintError on createEvent → graceful handling, no throw', async () => {
      mockPolicyEventsRepo.findByStripeEventId.mockResolvedValue(null);
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(mockPayment);
      mockPoliciesRepo.findByStripeIntentId.mockResolvedValue(null);
      mockPoliciesRepo.saveWithoutTenantScope.mockResolvedValue({
        id: POLICY_ID,
        policyNumber: 'DEMO-001',
        deliveryAddress: null,
      });
      mockPaymentsRepo.updatePaymentMethod.mockResolvedValue(undefined);
      mockPdfQueue.add.mockResolvedValue({});

      // Simulate race condition: unique constraint violation on INSERT
      const uniqueConstraintError = Object.assign(
        new Error('unique violation'),
        { code: '23505' },
      );
      mockPolicyEventsRepo.createEvent.mockRejectedValueOnce(
        uniqueConstraintError,
      );

      await expect(
        service.handleEvent(makeSucceededEvent()),
      ).resolves.not.toThrow();
    });

    it('AC3: race condition — UniqueConstraintError → logs [IDEMPOTENCY] Race condition warn', async () => {
      mockPolicyEventsRepo.findByStripeEventId.mockResolvedValue(null);
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(mockPayment);
      mockPoliciesRepo.findByStripeIntentId.mockResolvedValue(null);
      mockPoliciesRepo.saveWithoutTenantScope.mockResolvedValue({
        id: POLICY_ID,
        policyNumber: 'DEMO-001',
        deliveryAddress: null,
      });
      mockPaymentsRepo.updatePaymentMethod.mockResolvedValue(undefined);
      mockPdfQueue.add.mockResolvedValue({});

      const uniqueConstraintError = Object.assign(
        new Error('unique violation'),
        { code: '23505' },
      );
      mockPolicyEventsRepo.createEvent.mockRejectedValueOnce(
        uniqueConstraintError,
      );
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      await service.handleEvent(makeSucceededEvent());

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[IDEMPOTENCY] Race condition'),
      );
    });

    it('AC3: non-unique DB error is re-thrown', async () => {
      mockPolicyEventsRepo.findByStripeEventId.mockResolvedValue(null);
      mockPaymentsRepo.findByStripeIntentId.mockResolvedValue(mockPayment);
      mockPoliciesRepo.findByStripeIntentId.mockResolvedValue(null);
      mockPoliciesRepo.saveWithoutTenantScope.mockResolvedValue({
        id: POLICY_ID,
        policyNumber: 'DEMO-001',
        deliveryAddress: null,
      });
      mockPaymentsRepo.updatePaymentMethod.mockResolvedValue(undefined);
      mockPdfQueue.add.mockResolvedValue({});

      const otherError = Object.assign(new Error('connection lost'), {
        code: '08006',
      });
      mockPolicyEventsRepo.createEvent.mockRejectedValueOnce(otherError);

      await expect(service.handleEvent(makeSucceededEvent())).rejects.toThrow(
        'connection lost',
      );
    });
  });
});
