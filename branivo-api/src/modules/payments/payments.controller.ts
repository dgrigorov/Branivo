import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentIntentResponseDto } from './dto/payment-intent-response.dto';
import { ClientJwtAuthGuard } from '../clients/guards/client-jwt-auth.guard';
import { CurrentUser } from '../clients/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
}
