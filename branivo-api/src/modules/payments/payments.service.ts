import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { QuotesRepository } from '../quotes/quotes.repository';
import { QuoteStatus } from '../quotes/entities/quote.entity';
import { TenantsRepository } from '../tenants/tenants.repository';
import { PaymentsRepository } from './payments.repository';
import { PaymentStatus } from './entities/payment.entity';
import { StripeService } from './stripe.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentIntentResponseDto } from './dto/payment-intent-response.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly quotesRepo: QuotesRepository,
    private readonly tenantsRepo: TenantsRepository,
    private readonly stripeService: StripeService,
    private readonly tenantContext: TenantContext,
    private readonly config: ConfigService,
  ) {}

  async createIntent(
    dto: CreatePaymentIntentDto & { endClientId?: string },
  ): Promise<PaymentIntentResponseDto> {
    const tenantId = this.tenantContext.getTenantId();
    const idempotencyKey = `${tenantId}:${dto.quoteId}`;

    // 1. Idempotency check — ако вече съществува, върни го
    const existing =
      await this.paymentsRepo.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        clientSecret: existing.stripeClientSecret,
        paymentId: existing.stripePaymentIntentId, // H1 fix: consistent Stripe PI ID
        amount: Number(existing.amount),
        currency: existing.currency,
      };
    }

    // 2. Зареди quote и провери статус
    const quote = await this.quotesRepo.findOneById(dto.quoteId);
    if (!quote || quote.status !== QuoteStatus.SUCCESS || !quote.price) {
      throw new BadRequestException('Quote is not available for purchase');
    }

    // 3. Изчисли application_fee_amount
    const platformFeePct = parseFloat(
      this.config.get<string>('PLATFORM_FEE_PCT') ?? '0.05',
    );
    // TODO (Story 5.1): заредена commission_matrix overrides platformFeePct
    const amountCents = Math.round(quote.price * 100);
    const feeCents = Math.round(amountCents * platformFeePct);

    // 4. Вземи Stripe account на тенанта
    const tenant = await this.tenantsRepo.findById(tenantId);
    if (!tenant?.stripeAccountId) {
      throw new BadRequestException('Tenant Stripe account not configured');
    }

    // 5. Създай PaymentIntent в Stripe
    const intent = await this.stripeService.createPaymentIntent({
      amount: amountCents,
      currency: quote.currency ?? 'BGN',
      applicationFeeAmount: feeCents,
      stripeAccountId: tenant.stripeAccountId,
      idempotencyKey,
      metadata: {
        tenantId,
        quoteId: dto.quoteId,
        insurerCode: quote.insurer?.code ?? '',
      },
    });

    // 6. Запази в DB — wrap в try/catch: ако DB fail-не след успешен Stripe call,
    // logни PI ID за ръчно възстановяване (M1 fix)
    try {
      await this.paymentsRepo.save({
        tenantId,
        quoteId: dto.quoteId,
        endClientId: dto.endClientId ?? null,
        stripePaymentIntentId: intent.id,
        idempotencyKey,
        amount: quote.price,
        currency: quote.currency ?? 'BGN',
        applicationFeeAmount: feeCents / 100,
        platformFeePct,
        status: PaymentStatus.PENDING,
        stripeClientSecret: intent.client_secret!,
        metadata: {
          insurerCode: quote.insurer?.code ?? '',
          ...(dto.deliveryAddress
            ? { deliveryAddress: dto.deliveryAddress }
            : {}),
        },
      });
    } catch (dbError) {
      this.logger.error(
        `DB save failed after Stripe PI ${intent.id} was created. ` +
          `Recoverable via idempotency key: ${idempotencyKey}`,
        dbError instanceof Error ? dbError.stack : String(dbError),
      );
      throw new InternalServerErrorException(
        'Payment processing error — please retry',
      );
    }

    return {
      clientSecret: intent.client_secret!,
      paymentId: intent.id,
      amount: quote.price,
      currency: quote.currency ?? 'BGN',
    };
  }
}
