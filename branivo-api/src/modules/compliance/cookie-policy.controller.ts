import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../clients/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CookiePolicyService } from './cookie-policy.service';
import { CreateCookiePolicyDto } from './dto/create-cookie-policy.dto';
import {
  CookiePolicyListItemDto,
  CookiePolicyResponseDto,
} from './dto/cookie-policy-response.dto';

@Controller('tenants/cookie-policy')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CookiePolicyController {
  constructor(private readonly cookiePolicyService: CookiePolicyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('broker_admin')
  async create(
    @Body() dto: CreateCookiePolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CookiePolicyResponseDto> {
    return this.cookiePolicyService.create(dto, user.userId);
  }

  @Put(':id/publish')
  @Roles('broker_admin')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CookiePolicyResponseDto> {
    return this.cookiePolicyService.publish(id, user.userId);
  }

  @Get()
  @Roles('broker_admin', 'broker_agent', 'broker_viewer')
  async findAll(): Promise<CookiePolicyListItemDto[]> {
    return this.cookiePolicyService.findAll();
  }
}
