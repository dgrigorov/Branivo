import { randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import Stripe from 'stripe';
import { QUEUE_PDF_GENERATION } from '../../infrastructure/queues/queue.module';
import { StripeService } from './stripe.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentStatus } from './entities/payment.entity';
import { PoliciesRepository } from '../policies/policies.repository';
import { PolicyEventsRepository } from '../policies/policy-events.repository';
import { PolicyStatus } from '../policies/entities/policy.entity';
import { PolicyEventType } from '../policies/entities/policy-event.entity';
import { QuotesRepository } from '../quotes/quotes.repository';

export interface PdfGenerationJobPayload {
  policyId: string;
  tenantId: string;
  quoteId: string;
  endClientId?: string;
}

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly paymentsRepo: PaymentsRepository,
    private readonly policiesRepo: PoliciesRepository,
    private readonly policyEventsRepo: PolicyEventsRepository,
    private readonly quotesRepo: QuotesRepository,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_PDF_GENERATION)
    private readonly pdfQueue: Queue<PdfGenerationJobPayload>,
  ) {}

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    return this.stripeService.constructWebhookEvent(rawBody, signature, secret);
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.id, event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.id, event.data.object);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async handlePaymentSucceeded(
    stripeEventId: string,
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(`Processing payment_intent.succeeded for: ${intent.id}`);

    // 1. Намери payment record (без tenant scope)
    const payment = await this.paymentsRepo.findByStripeIntentId(intent.id);
    if (!payment) {
      this.logger.warn(`Payment not found for intent: ${intent.id}`);
      return;
    }

    // 2. Idempotency check — провери дали полицата вече е активирана
    const existingPolicy = await this.policiesRepo.findByStripeIntentId(
      intent.id,
    );
    if (existingPolicy?.status === PolicyStatus.ACTIVE) {
      this.logger.log(`Policy already active for intent: ${intent.id} — no-op`);
      return;
    }

    // 3. Update payment status
    await this.paymentsRepo.updateStatus(payment.id, PaymentStatus.SUCCEEDED);

    // 4. Вземи commission данни от payment record
    const platformFeePct = Number(payment.platformFeePct);
    const premiumAmount = Number(payment.amount);
    const commissionAmount = Number(payment.applicationFeeAmount);

    // 5. Вземи insurerId от quote (без tenant scope — webhook context)
    const quote = await this.quotesRepo.findByIdWithoutScope(payment.quoteId);
    const insurerId = quote?.insurerId ?? '';

    // 6. Генерирай policy_number
    const policyNumber = this.generatePolicyNumber(payment.tenantId);

    // 7. Създай или вземи policy record
    let policy = existingPolicy;
    if (!policy) {
      policy = await this.policiesRepo.saveWithoutTenantScope({
        tenantId: payment.tenantId,
        paymentId: payment.id,
        quoteId: payment.quoteId,
        endClientId: payment.endClientId ?? undefined,
        insurerId,
        policyNumber,
        status: PolicyStatus.ACTIVE,
        stripePaymentIntentId: intent.id,
        premiumAmount,
        commissionAmount, // IMMUTABLE snapshot
        commissionPct: platformFeePct, // IMMUTABLE snapshot
        currency: payment.currency,
        metadata: { stripeEventId },
      });
    } else {
      await this.policiesRepo.activatePolicy(policy.id);
    }

    // 8. Създай immutable policy_event (AC5 — ЗАДЪЛЖИТЕЛНО)
    await this.policyEventsRepo.createEvent({
      tenantId: payment.tenantId,
      policyId: policy.id,
      eventType: PolicyEventType.ACTIVATED,
      payload: {
        stripePaymentIntentId: intent.id,
        amount: premiumAmount,
        currency: payment.currency,
      },
      stripeEventId,
    });

    // 9. Queue PDF generation job (AC5 — ЗАДЪЛЖИТЕЛНО)
    await this.pdfQueue.add(
      'generate-policy-pdf',
      {
        policyId: policy.id,
        tenantId: payment.tenantId,
        quoteId: payment.quoteId,
        endClientId: payment.endClientId ?? undefined,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
      },
    );

    // 10. Log policy.pdf_queued event
    await this.policyEventsRepo.createEvent({
      tenantId: payment.tenantId,
      policyId: policy.id,
      eventType: PolicyEventType.PDF_QUEUED,
      payload: { queuedAt: new Date().toISOString() },
      stripeEventId,
    });

    this.logger.log(
      `Policy activated: ${policy.id} for tenant: ${payment.tenantId}`,
    );
  }

  private async handlePaymentFailed(
    stripeEventId: string,
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(
      `Processing payment_intent.payment_failed for: ${intent.id}`,
    );

    const payment = await this.paymentsRepo.findByStripeIntentId(intent.id);
    if (!payment) {
      this.logger.warn(`Payment not found for intent: ${intent.id}`);
      return;
    }

    // Update payment status
    const reason = intent.last_payment_error?.message ?? 'Payment failed';
    await this.paymentsRepo.updateStatus(
      payment.id,
      PaymentStatus.FAILED,
      reason,
    );

    // НЕ активирай полица (AC4)
    this.logger.log(
      `Payment failed for intent: ${intent.id} (event: ${stripeEventId}), no policy activation`,
    );
    // TODO (Story 4.4): Queue notification job за клиента
  }

  private generatePolicyNumber(tenantId: string): string {
    const prefix = tenantId.substring(0, 4).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = randomBytes(3).toString('hex').toUpperCase(); // M2 fix: crypto randomBytes instead of Math.random()
    return `${prefix}-${timestamp}-${random}`;
  }
}
