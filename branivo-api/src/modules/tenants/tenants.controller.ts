import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantsService } from './tenants.service';
import { TenantConfigResponseDto } from './dto/tenant-config-response.dto';
import { UpdateBrandingDto } from './dto/update-branding.dto';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get tenant configuration by Host header' })
  async getConfig(): Promise<{ data: TenantConfigResponseDto }> {
    const data = await this.tenantsService.getTenantConfig();
    return { data };
  }

  @Put('branding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('broker_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update tenant branding (logo, colors, font)' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_, file, cb) => {
        const allowed = ['image/png', 'image/svg+xml'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException('Само PNG и SVG файлове са разрешени'),
            false,
          );
        }
      },
    }),
  )
  async updateBranding(
    @Body() dto: UpdateBrandingDto,
    @UploadedFile() logo?: Express.Multer.File,
  ): Promise<void> {
    return this.tenantsService.updateBranding(dto, logo);
  }
}
