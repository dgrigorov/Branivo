import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { QUEUE_WEBHOOK_PROCESSING } from '../../infrastructure/queues/queue.module';
import { PaymentsService } from './payments.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentIntentResponseDto } from './dto/payment-intent-response.dto';
import { ClientJwtAuthGuard } from '../clients/guards/client-jwt-auth.guard';
import { CurrentUser } from '../clients/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly stripeWebhookService: StripeWebhookService,
    @InjectQueue(QUEUE_WEBHOOK_PROCESSING)
    private readonly webhookQueue: Queue<Stripe.Event>,
  ) {}

  @Post('intent')
  @UseGuards(ClientJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 payment intent requests/min/user
  async createIntent(
    @Body() dto: CreatePaymentIntentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentIntentResponseDto> {
    return this.paymentsService.createIntent({
      ...dto,
      endClientId: user.userId,
    });
  }

  // Stripe webhook — NO JwtAuthGuard, protected via signature verification
  @Post('webhook')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeWebhookService.constructEvent(
        request.rawBody!, // Buffer — ЗАДЪЛЖИТЕЛНО; НЕ request.body
        signature,
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Webhook signature verification failed';
      throw new BadRequestException(`Webhook Error: ${message}`);
    }

    // Enqueue for async processing — Stripe requires fast 200 response (< 30 sec)
    // BullMQ handles retry with exponential backoff (AC3)
    await this.webhookQueue.add('process-stripe-event', event, {
      jobId: event.id, // idempotency: same event id → same job, no duplicates
    });

    return { received: true };
  }
}
