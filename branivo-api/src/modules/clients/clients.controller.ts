import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientJwtAuthGuard } from './guards/client-jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ClientsService } from './clients.service';
import { RegisterPushSubscriptionDto } from '../notifications/dto/register-push-subscription.dto';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post('me/push-subscription')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClientJwtAuthGuard)
  async registerPushSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushSubscriptionDto,
  ): Promise<{ success: boolean }> {
    await this.clientsService.registerPushSubscription(user.userId, dto);
    return { success: true };
  }
}
