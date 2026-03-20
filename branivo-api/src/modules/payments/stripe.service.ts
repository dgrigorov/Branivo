import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2026-02-25.clover',
        typescript: true,
      },
    );
  }

  async createPaymentIntent(params: {
    amount: number; // в стотинки (cents) — BGN × 100
    currency: string;
    applicationFeeAmount: number; // в стотинки
    stripeAccountId: string; // Stripe Connect acct на тенанта
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create(
      {
        amount: Math.round(params.amount),
        currency: params.currency.toLowerCase(),
        application_fee_amount: Math.round(params.applicationFeeAmount),
        payment_method_types: ['card'], // Apple Pay / Google Pay са auto-enabled за card
        payment_method_options: {
          card: {
            request_three_d_secure: 'any', // ЗАДЪЛЖИТЕЛНО: PSD2 compliance (NFR45)
          },
        },
        metadata: params.metadata,
        transfer_data: {
          destination: params.stripeAccountId,
        },
      },
      {
        idempotencyKey: params.idempotencyKey,
      },
    );
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event {
    // ВАЖНО: rawBody трябва да е Buffer от NestJS rawBody: true — не JSON.parsed
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  // Ще е нужен в Story 4.3 — дефинирай тук за consistency
  getStripe(): Stripe {
    return this.stripe;
  }
}
