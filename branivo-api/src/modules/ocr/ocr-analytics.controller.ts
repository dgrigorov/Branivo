import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OcrAnalyticsService } from './ocr-analytics.service';
import {
  OcrAnalyticsFiltersDto,
  OcrAnalyticsResponseDto,
  OcrSessionFiltersDto,
  OcrSessionsResponseDto,
  OcrTrendFiltersDto,
  OcrTrendPoint,
} from './dto/ocr-analytics.dto';

@Controller('ocr/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class OcrAnalyticsController {
  constructor(private readonly analyticsService: OcrAnalyticsService) {}

  @Get()
  async getAnalytics(
    @Query() filters: OcrAnalyticsFiltersDto,
  ): Promise<OcrAnalyticsResponseDto> {
    return this.analyticsService.getAnalytics(filters);
  }

  @Get('trend')
  async getTrend(
    @Query() filters: OcrTrendFiltersDto,
  ): Promise<OcrTrendPoint[]> {
    return this.analyticsService.getTrend(
      filters.field,
      filters.days ?? 7,
      filters.tenantId,
    );
  }

  @Get('sessions')
  async getSessions(
    @Query() filters: OcrSessionFiltersDto,
  ): Promise<OcrSessionsResponseDto> {
    return this.analyticsService.getSessions(filters);
  }
}
