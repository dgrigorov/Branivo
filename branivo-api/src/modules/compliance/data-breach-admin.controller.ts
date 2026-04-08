import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../clients/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { DataBreachService } from './data-breach.service';
import { ReportDataBreachDto } from './dto/report-data-breach.dto';
import { UpdateDataBreachDto } from './dto/update-data-breach.dto';
import { DataBreachResponseDto } from './dto/data-breach-response.dto';
import { DataBreachStatsResponseDto } from './dto/data-breach-stats-response.dto';
import { ListDataBreachesDto } from './dto/list-data-breaches.dto';

@Controller('admin/data-breaches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class DataBreachAdminController {
  constructor(private readonly dataBreachService: DataBreachService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async report(
    @Body() dto: ReportDataBreachDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DataBreachResponseDto> {
    return this.dataBreachService.reportBreach(dto, user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDataBreachDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DataBreachResponseDto> {
    return this.dataBreachService.updateBreach(id, dto, user.userId);
  }

  @Get()
  async list(@Query() query: ListDataBreachesDto): Promise<{
    items: DataBreachResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.dataBreachService.getBreaches(query);
  }

  // IMPORTANT: /stats must be declared BEFORE /:id to avoid route conflict
  @Get('stats')
  async stats(): Promise<DataBreachStatsResponseDto> {
    return this.dataBreachService.getStats();
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataBreachResponseDto> {
    return this.dataBreachService.getBreachById(id);
  }
}
