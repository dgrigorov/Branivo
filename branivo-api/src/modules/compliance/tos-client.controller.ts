import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientJwtAuthGuard } from '../clients/guards/client-jwt-auth.guard';
import { CurrentUser } from '../clients/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TosService } from './tos.service';
import { AcceptTosDto } from './dto/accept-tos.dto';
import {
  TosAcceptanceResponseDto,
  TosStatusResponseDto,
} from './dto/tos-response.dto';

@Controller('clients/tos')
@UseGuards(ClientJwtAuthGuard)
export class TosClientController {
  constructor(private readonly tosService: TosService) {}

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Body() dto: AcceptTosDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<TosAcceptanceResponseDto> {
    return this.tosService.accept(
      user.userId,
      dto,
      xForwardedFor ?? null,
      userAgent ?? null,
    );
  }

  @Get('status')
  async getStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TosStatusResponseDto> {
    return this.tosService.getStatus(user.userId);
  }
}
