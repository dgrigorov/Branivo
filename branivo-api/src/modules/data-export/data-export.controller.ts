import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientJwtAuthGuard } from '../clients/guards/client-jwt-auth.guard';
import { CurrentUser } from '../clients/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { DataExportService } from './data-export.service';
import {
  DataExportResponseDto,
  DataExportStatusResponseDto,
} from './dto/data-export-response.dto';

@Controller('clients/me/data-export')
@UseGuards(ClientJwtAuthGuard)
export class DataExportController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async requestExport(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DataExportResponseDto> {
    return this.dataExportService.requestExport(user.userId);
  }

  @Get('status')
  async getStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DataExportStatusResponseDto> {
    return this.dataExportService.getStatus(user.userId);
  }
}
