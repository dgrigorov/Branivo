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
import { TosService } from './tos.service';
import { CreateTosDto } from './dto/create-tos.dto';
import { TosListItemDto, TosResponseDto } from './dto/tos-response.dto';

@Controller('tenants/tos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TosController {
  constructor(private readonly tosService: TosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('broker_admin')
  async create(
    @Body() dto: CreateTosDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TosResponseDto> {
    return this.tosService.create(dto, user.userId);
  }

  @Put(':id/publish')
  @Roles('broker_admin')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TosResponseDto> {
    return this.tosService.publish(id, user.userId);
  }

  @Get()
  @Roles('broker_admin', 'broker_agent')
  async findAll(): Promise<TosListItemDto[]> {
    return this.tosService.findAll();
  }
}
