import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  FscInsurerDto,
  FscInsurerQueryDto,
  FscSyncResponseDto,
  FscSyncStatusDto,
} from './dto/fsc-insurer.dto';
import { FSC_CATEGORIES } from './insurers.constants';
import { InsurersService } from './insurers.service';

@Controller('insurers/fsc')
export class InsurersController {
  constructor(private readonly insurersService: InsurersService) {}

  @Get('categories')
  categories() {
    return FSC_CATEGORIES;
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async sync(): Promise<FscSyncResponseDto> {
    return this.insurersService.syncFromFsc();
  }

  @Get('sync/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  getSyncStatus(): FscSyncStatusDto {
    return this.insurersService.getSyncStatus();
  }

  @Get()
  async list(@Query() query: FscInsurerQueryDto): Promise<FscInsurerDto[]> {
    const rows = await this.insurersService.list(query);
    return rows.map((row) => ({
      id: row.id,
      categoryKey: row.categoryKey,
      categoryLabel: row.categoryLabel,
      name: row.name,
      eik: row.eik,
      officeAddress: row.officeAddress,
      website: row.website,
      contactDetails: row.contactDetails,
      contactPhone: row.contactPhone,
      contactEmails: row.contactEmails ?? [],
      longDescription: row.longDescription,
      logoUrl: row.logoUrl,
      socialLinks: row.socialLinks ?? [],
      trustpilotUrl: row.trustpilotUrl,
      websiteEnrichedAt: row.websiteEnrichedAt
        ? row.websiteEnrichedAt.toISOString()
        : null,
      sourceUrl: row.sourceUrl,
      scrapedAt: row.scrapedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
