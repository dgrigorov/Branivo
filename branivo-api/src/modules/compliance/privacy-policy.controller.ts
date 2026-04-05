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
import { PrivacyPolicyService } from './privacy-policy.service';
import { CreatePrivacyPolicyDto } from './dto/create-privacy-policy.dto';
import {
  PrivacyPolicyListItemDto,
  PrivacyPolicyResponseDto,
} from './dto/privacy-policy-response.dto';

@Controller('tenants/privacy-policy')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrivacyPolicyController {
  constructor(private readonly privacyPolicyService: PrivacyPolicyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('broker_admin')
  async create(
    @Body() dto: CreatePrivacyPolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PrivacyPolicyResponseDto> {
    return this.privacyPolicyService.create(dto, user.userId);
  }

  @Put(':id/publish')
  @Roles('broker_admin')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PrivacyPolicyResponseDto> {
    return this.privacyPolicyService.publish(id, user.userId);
  }

  @Get()
  @Roles('broker_admin', 'broker_agent', 'broker_viewer')
  async findAll(): Promise<PrivacyPolicyListItemDto[]> {
    return this.privacyPolicyService.findAll();
  }

  @Get(':id')
  @Roles('broker_admin', 'broker_agent', 'broker_viewer')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PrivacyPolicyResponseDto> {
    return this.privacyPolicyService.findOne(id);
  }
}
