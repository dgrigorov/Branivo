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
import { CookieConsentService } from './cookie-consent.service';
import { SaveCookieConsentDto } from './dto/save-cookie-consent.dto';
import {
  CookieConsentResponseDto,
  SaveCookieConsentResponseDto,
} from './dto/cookie-consent-response.dto';

@Controller('clients/cookie-consent')
@UseGuards(ClientJwtAuthGuard)
export class CookieConsentClientController {
  constructor(private readonly cookieConsentService: CookieConsentService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async save(
    @Body() dto: SaveCookieConsentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-forwarded-for') xForwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<SaveCookieConsentResponseDto> {
    return this.cookieConsentService.saveConsent(
      user.userId,
      dto,
      xForwardedFor ?? null,
      userAgent ?? null,
    );
  }

  @Get()
  async get(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CookieConsentResponseDto> {
    return this.cookieConsentService.getConsent(user.userId);
  }
}
