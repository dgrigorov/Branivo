import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { TenantContext } from '../../common/tenant-context/tenant.context';
import { AnonymousSessionsService } from '../sessions/anonymous-sessions.service';
import { ClientAuthService } from './client-auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { ClientJwtAuthGuard } from './guards/client-jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('auth/client')
export class ClientAuthController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    private readonly tenantContext: TenantContext,
    private readonly anonymousSessionsService: AnonymousSessionsService,
  ) {}

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async requestOtp(
    @Body() dto: RequestOtpDto,
  ): Promise<{ message: string; expires_in: number }> {
    const tenantId = this.tenantContext.getTenantId();
    const { expires_in } = await this.clientAuthService.requestOtp(
      dto.phone_number,
      tenantId,
    );
    return { message: 'OTP изпратен', expires_in };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    access_token: string;
    user: { id: string; phone_number: string | null; is_new: boolean };
  }> {
    const tenantId = this.tenantContext.getTenantId();

    const { client, isNew } = await this.clientAuthService.verifyOtp(
      dto.phone_number,
      dto.otp_code,
      tenantId,
    );

    const { access_token, refresh_token } =
      await this.clientAuthService.generateTokens(client);

    if (dto.session_id) {
      try {
        await this.anonymousSessionsService.migrateSession(
          dto.session_id,
          tenantId,
          client.id,
        );
      } catch {
        // Non-fatal: session may have already expired
      }
    }

    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth/client/refresh',
    });

    return {
      access_token,
      user: {
        id: client.id,
        phone_number: client.phoneNumber,
        is_new: isNew,
      },
    };
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async googleAuth(
    @Body() dto: GoogleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    access_token: string;
    user: {
      id: string;
      phone_number: string | null;
      is_new: boolean;
      account_merged: boolean;
      phone_verified: boolean;
    };
  }> {
    const tenantId = this.tenantContext.getTenantId();

    const { client, isNew, accountMerged } =
      await this.clientAuthService.googleAuth(dto, tenantId);

    const { access_token, refresh_token } =
      await this.clientAuthService.generateTokens(client);

    if (dto.session_id) {
      try {
        await this.anonymousSessionsService.migrateSession(
          dto.session_id,
          tenantId,
          client.id,
        );
      } catch {
        // Non-fatal: session may have already expired
      }
    }

    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth/client/refresh',
    });

    return {
      access_token,
      user: {
        id: client.id,
        phone_number: client.phoneNumber,
        is_new: isNew,
        account_merged: accountMerged,
        phone_verified: client.phoneVerified,
      },
    };
  }

  @Post('phone/request-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClientJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async requestPhoneOtp(
    @Body() dto: RequestOtpDto,
  ): Promise<{ message: string; expires_in: number }> {
    const tenantId = this.tenantContext.getTenantId();
    const { expires_in } = await this.clientAuthService.requestPhoneOtp(
      dto.phone_number,
      tenantId,
    );
    return { message: 'OTP изпратен', expires_in };
  }

  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClientJwtAuthGuard)
  async verifyPhone(
    @Body() dto: VerifyOtpDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const tenantId = this.tenantContext.getTenantId();
    await this.clientAuthService.verifyPhoneOtp(
      user.userId,
      dto.phone_number,
      dto.otp_code,
      tenantId,
    );
    return { message: 'Телефонният номер е верифициран успешно.' };
  }
}
