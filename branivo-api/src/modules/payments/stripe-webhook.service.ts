import { randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import {
  QUEUE_LOGISTICS,
  QUEUE_PDF_GENERATION,
} from '../../infrastructure/queues/queue.module';
import { EmailService } from '../../infrastructure/email/email.service';
import { StripeService } from './stripe.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentMethod, PaymentStatus } from './entities/payment.entity';
import { PoliciesRepository } from '../policies/policies.repository';
import { PolicyEventsRepository } from '../policies/policy-events.repository';
import { PolicyStatus } from '../policies/entities/policy.entity';
import { PolicyEventType } from '../policies/entities/policy-event.entity';
import { QuotesRepository } from '../quotes/quotes.repository';
import { TenantsRepository } from '../tenants/tenants.repository';
import type { TenantStatus } from '../tenants/entities/tenant.entity';
import { StickerDeliveryJobPayload } from '../logistics/interfaces/sticker-delivery-job.payload';
import { DeliveryAddress } from '../logistics/interfaces/delivery-address.interface';
import { CommissionsService } from '../commissions/commissions.service';
import { AuditService } from '../../common/audit/audit.service';

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
    private readonly tenantsRepo: TenantsRepository,
    private readonly config: ConfigService,
    private readonly commissionsService: CommissionsService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    @InjectQueue(QUEUE_PDF_GENERATION)
    private readonly pdfQueue: Queue<PdfGenerationJobPayload>,
    @InjectQueue(QUEUE_LOGISTICS)
    private readonly logisticsQueue: Queue<StickerDeliveryJobPayload>,
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
      case 'account.updated':
        await this.handleAccountUpdated(event.id, event.data.object);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async handleAccountUpdated(
    stripeEventId: string,
    account: Stripe.Account,
  ): Promise<void> {
    this.logger.log(
      `Processing account.updated for stripeAccountId: ${account.id}`,
    );

    // 1. Find tenant by stripeAccountId
    const tenant = await this.tenantsRepo.findByStripeAccountId(account.id);
    if (!tenant) {
      this.logger.warn(
        `No tenant found for stripeAccountId: ${account.id} — skipping`,
      );
      return;
    }

    // 2. Determine new status
    const newStatus: TenantStatus = account.charges_enabled
      ? 'active'
      : 'stripe_revoked';

    // 3. Idempotency (AC4) — skip if already in target status
    if (tenant.status === newStatus) {
      this.logger.log(
        `[IDEMPOTENCY] Duplicate Stripe event skipped: ${stripeEventId}`,
      );
      return;
    }

    // 4. Update tenant status
    await this.tenantsRepo.updateStatus(tenant.id, newStatus);

    // 5. Write audit_log (IMMUTABLE — INSERT only, hash-chained)
    const action = account.charges_enabled
      ? 'stripe_account_reinstated'
      : 'stripe_account_revoked';
    await this.auditService.log({
      tenantId: tenant.id,
      action,
      entityType: 'tenant',
      entityId: tenant.id,
      metadata: {
        stripeEventId,
        stripeAccountId: account.id,
        chargesEnabled: account.charges_enabled,
      },
    });

    // 6. Find broker_admin email and send notification
    const brokerAdminRows = await this.dataSource.query<
      Array<{ email: string }>
    >(
      `SELECT email FROM users WHERE tenant_id = $1 AND role = 'broker_admin' LIMIT 1`,
      [tenant.id],
    );
    const brokerEmail = brokerAdminRows[0]?.email;
    if (brokerEmail) {
      await this.emailService.sendStripeRevocationEmail({
        to: brokerEmail,
        tenantName: tenant.name,
        isRevoked: !account.charges_enabled,
        stripeAccountId: account.id,
      });
    } else {
      this.logger.warn(
        `No broker_admin email found for tenant ${tenant.id} — skipping revocation email`,
      );
    }

    this.logger.log(
      `Tenant ${tenant.id} status updated to ${newStatus} (event: ${stripeEventId})`,
    );
  }

  private isUniqueConstraintError(err: unknown): boolean {
    return (
      err instanceof Error &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    );
  }

  private async handlePaymentSucceeded(
    stripeEventId: string,
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    this.logger.log(`Processing payment_intent.succeeded for: ${intent.id}`);

    // 0. Idempotency check — дублиран Stripe event (preemptive, before any DB reads)
    const existingEvent =
      await this.policyEventsRepo.findByStripeEventId(stripeEventId);
    if (existingEvent) {
      this.logger.log(
        `[IDEMPOTENCY] Duplicate Stripe event skipped: ${stripeEventId}`,
      );
      return;
    }

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

    // 3b. Record payment method (apple_pay / google_pay / card)
    // NOTE: payment_method_types is ALWAYS ['card'] for Apple Pay/Google Pay —
    // wallet type must be detected via expanded payment_method.card.wallet.type
    let paymentMethod = PaymentMethod.CARD;
    try {
      const expandedIntent =
        await this.stripeService.retrievePaymentIntentWithMethod(intent.id);
      const pm =
        typeof expandedIntent.payment_method === 'object'
          ? expandedIntent.payment_method
          : null;
      const walletType = pm?.card?.wallet?.type as string | undefined;
      const walletMap: Record<string, PaymentMethod> = {
        apple_pay: PaymentMethod.APPLE_PAY,
        google_pay: PaymentMethod.GOOGLE_PAY,
      };
      if (walletType && walletMap[walletType]) {
        paymentMethod = walletMap[walletType];
      }
    } catch (err) {
      this.logger.warn(
        `Failed to retrieve payment method details for intent ${intent.id}, defaulting to 'card'`,
        err instanceof Error ? err.message : String(err),
      );
    }
    await this.paymentsRepo.updatePaymentMethod(payment.id, paymentMethod);

    // 4. Вземи commission данни от payment record
    const platformFeePct = Number(payment.platformFeePct);
    const premiumAmount = Number(payment.amount);
    const commissionAmount = Number(payment.applicationFeeAmount);

    // 5. Вземи insurerId от quote (без tenant scope — webhook context)
    const quote = await this.quotesRepo.findByIdWithoutScope(payment.quoteId);
    const insurerId = quote?.insurerId ?? '';

    // 6. Генерирай policy_number
    const policyNumber = this.generatePolicyNumber(payment.tenantId);

    // 7. Извлечи deliveryAddress от payment metadata
    const deliveryAddress =
      (payment.metadata?.['deliveryAddress'] as DeliveryAddress | undefined) ??
      null;

    // 8. Създай или вземи policy record
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
        deliveryAddress,
        metadata: { stripeEventId },
      });
    } else {
      await this.policiesRepo.activatePolicy(policy.id);
    }

    // 8. Създай immutable policy_event (AC5 — ЗАДЪЛЖИТЕЛНО)
    // Race condition guard: UniqueConstraintError (23505) → другият processor вече е записал event
    try {
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
    } catch (err: unknown) {
      if (this.isUniqueConstraintError(err)) {
        this.logger.warn(
          `[IDEMPOTENCY] Race condition: stripe_event_id already exists: ${stripeEventId}`,
        );
        return;
      }
      throw err;
    }

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
    // NOTE: stripeEventId НЕ се предава — UNIQUE INDEX позволява само един ред per stripe_event_id.
    // ACTIVATED event вече е записан с този stripeEventId; PDF_QUEUED не се ползва за idempotency.
    await this.policyEventsRepo.createEvent({
      tenantId: payment.tenantId,
      policyId: policy.id,
      eventType: PolicyEventType.PDF_QUEUED,
      payload: { queuedAt: new Date().toISOString() },
    });

    // 11. Queue sticker delivery job (AC1 — само ако feature flag е enabled)
    const tenant = await this.tenantsRepo.findById(payment.tenantId);
    if (
      tenant?.features?.['sticker_delivery'] === true &&
      policy.deliveryAddress
    ) {
      await this.logisticsQueue.add(
        'logistics:sticker-create',
        {
          policyId: policy.id,
          tenantId: payment.tenantId,
          policyNumber: policy.policyNumber,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
        },
      );
    }

    // 12. Потвърди pending commission event (AC: #4)
    try {
      await this.commissionsService.confirmPendingEvent(
        payment.id,
        payment.tenantId,
      );
    } catch (confirmErr) {
      this.logger.error(
        `Failed to confirm pending commission event for payment ${payment.id}`,
        confirmErr instanceof Error ? confirmErr.stack : String(confirmErr),
      );
    }

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

    // Idempotency check (AC4) — дублиран payment_failed event
    if (payment.status === PaymentStatus.FAILED) {
      this.logger.log(
        `[IDEMPOTENCY] Duplicate Stripe event skipped: ${stripeEventId}`,
      );
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
    // Маркирай pending commission event като failed (AC: #4)
    try {
      await this.commissionsService.failPendingEvent(
        payment.id,
        payment.tenantId,
      );
    } catch (failErr) {
      this.logger.error(
        `Failed to fail pending commission event for payment ${payment.id}`,
        failErr instanceof Error ? failErr.stack : String(failErr),
      );
    }

    this.logger.log(
      `Payment failed for intent: ${intent.id} (event: ${stripeEventId}), no policy activation`,
    );
  }

  private generatePolicyNumber(tenantId: string): string {
    const prefix = tenantId.substring(0, 4).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = randomBytes(3).toString('hex').toUpperCase(); // M2 fix: crypto randomBytes instead of Math.random()
    return `${prefix}-${timestamp}-${random}`;
  }
}
