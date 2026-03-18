import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { RefreshDto } from './dto/refresh.dto';
import {
  AuthTokensResponseDto,
  LoginResponseDto,
} from './dto/auth-response.dto';
import { AuthenticatedUser } from './strategies/jwt.strategy';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags('auth')
@Throttle({ auth: { ttl: 60000, limit: 300 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Broker login with email + password' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  async login(
    @Req() req: Request,
    @Body() dto: LoginDto,
  ): Promise<LoginResponseDto> {
    return this.authService.login(req.hostname, dto.email, dto.password);
  }

  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA TOTP code' })
  @ApiResponse({ status: 200, type: AuthTokensResponseDto })
  async verify2FA(@Body() dto: Verify2FADto): Promise<AuthTokensResponseDto> {
    return this.authService.verify2FA(dto.temp_token, dto.otp_code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token' })
  @ApiResponse({ status: 200, type: AuthTokensResponseDto })
  async refresh(@Body() dto: RefreshDto): Promise<AuthTokensResponseDto> {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout and blacklist current token' })
  async logout(@Req() req: RequestWithUser): Promise<{ message: string }> {
    await this.authService.logout(
      req.user.jti,
      req.user.tenantId,
      req.user.exp,
    );
    return { message: 'Logged out successfully' };
  }
}
